import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import PaymentOrder from '../../models/PaymentOrder.js';
import Organization from '../../models/Organization.js';
import { createPayuCheckout, confirmPayuOrder, reconcilePayuSubscription } from '../../services/payuBilling.js';
let replset, user;
const json = data => ({ok:true,status:200,json:async()=>data});
beforeAll(async()=>{replset=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(replset.getUri());await PaymentOrder.init();},60000);
afterAll(async()=>{await mongoose.disconnect();await replset?.stop();},30000);
beforeEach(async()=>{
 await Promise.all([User.deleteMany({}),PaymentOrder.deleteMany({})]);
 for(const [k,v] of Object.entries({PAYU_ENV:'test',PAYU_MERCHANT_KEY:'merchant',PAYU_MERCHANT_SALT:'salt',PAYU_CALLBACK_ORIGIN:'https://billing.example.com',PAYU_ZION_ENABLED:'true',PAYU_ZION_TOKEN:'token',PAYU_PRACTICE_PRO_AMOUNT_PAISE:'10000',PAYU_PRACTICE_PRO_PLAN_ID:'plan1'})) vi.stubEnv(k,v);
 user=await User.create({name:'Test Customer',email:'test@example.com',password:'Test123!pass',isVerified:true});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const checkout = () => createPayuCheckout({product:'practice',plan:'pro',user,phone:'9876543210'});
const provider = (status='Enabled') => vi.fn(async(url,options)=>{
 if(url.includes('postservice')) {const txnid=options.body.get('var1');return json({status:1,transaction_details:{[txnid]:{status:'success',unmappedstatus:'captured',mihpayid:'pay1',amt:'100.00'}}});}
 if(options.method==='POST') return json({subscriptionId:'sub1',status});
 return json({subscriptionId:'sub1',authRefId:'pay1',status,subscriptionPlans:[{planId:'plan1',amount:{value:'100.00',currency:'INR'},numberOfPaidInvoices:0}]});
});
describe('PayU recurring access',()=>{
 it('reserves one checkout per owner across tabs',async()=>{await checkout();await expect(checkout()).rejects.toMatchObject({statusCode:409});expect(await PaymentOrder.countDocuments()).toBe(1);});
 it('locks organization checkout across different administrators',async()=>{
  vi.stubEnv('PAYU_HIRING_STARTER_AMOUNT_PAISE','20000');vi.stubEnv('PAYU_HIRING_STARTER_PLAN_ID','plan2');
  const org=await Organization.create({name:'Test Hiring Team',createdBy:user._id});
  await createPayuCheckout({product:'hiring',plan:'starter',user,organization:org,phone:'9876543210'});
  const admin=await User.create({name:'Second Admin',email:'admin@example.com',password:'Test123!pass'});
  await expect(createPayuCheckout({product:'hiring',plan:'starter',user:admin,organization:org,phone:'9876543210'})).rejects.toMatchObject({statusCode:409});
 });
 it('activates verified consent and creates one schedule across replays',async()=>{
  await checkout();const order=await PaymentOrder.findOne();const request=provider();vi.stubGlobal('fetch',request);
  await confirmPayuOrder(order.txnid);await confirmPayuOrder(order.txnid);
  expect(request.mock.calls.filter(([,o])=>o.method==='POST' && o.headers)).toHaveLength(1);
  const saved=await User.findById(user._id).select('+practiceBillingProvider +practiceBillingSubscriptionId');
  expect(saved.practicePlan).toBe('pro');expect(saved.practiceBillingProvider).toBe('payu');expect(saved.practiceBillingSubscriptionId).toBe('sub1');expect((await PaymentOrder.findById(order._id)).status).toBe('paid');
 });
 it('does not activate or recreate an unready mandate',async()=>{
  await checkout();const order=await PaymentOrder.findOne();const request=provider('Defined');vi.stubGlobal('fetch',request);
  await expect(confirmPayuOrder(order.txnid)).rejects.toMatchObject({statusCode:409});await expect(confirmPayuOrder(order.txnid)).rejects.toMatchObject({statusCode:409});
  expect(request.mock.calls.filter(([,o])=>o.method==='POST' && o.headers)).toHaveLength(1);expect((await User.findById(user._id)).practicePlan).toBe('free');
 });
 it('does not blindly retry ambiguous schedule creation',async()=>{
  await checkout();const order=await PaymentOrder.findOne();const base=provider();const request=vi.fn(async(url,o)=>{if(o.headers && o.method==='POST') throw new Error('timeout');return base(url,o);});vi.stubGlobal('fetch',request);
  await expect(confirmPayuOrder(order.txnid)).rejects.toThrow('timeout');await expect(confirmPayuOrder(order.txnid)).rejects.toMatchObject({statusCode:409});
  expect((await PaymentOrder.findById(order._id)).provisioning).toBe('review_required');expect(request.mock.calls.filter(([,o])=>o.headers && o.method==='POST')).toHaveLength(1);
 });
 it('keeps paid access after cancellation',async()=>{
  await checkout();const order=await PaymentOrder.findOne();vi.stubGlobal('fetch',provider());await confirmPayuOrder(order.txnid);vi.stubGlobal('fetch',provider('Cancelled'));await reconcilePayuSubscription('sub1');
  const saved=await User.findById(user._id);expect(saved.practiceSubscriptionStatus).toBe('active');expect(saved.practiceCancelAtPeriodEnd).toBe(true);
 });
});
