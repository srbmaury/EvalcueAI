import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentHash, responseHash, validResponseHash, sha512, verifyPayment, zionRequest } from '../../config/payu.js';
import { nextMonth, validateVerifiedPayment } from '../../services/payuBilling.js';
import { getPayuPrice } from '../../services/payuCatalog.js';
const fields = { key:'merchant', txnid:'order123', amount:'100.00', productinfo:'Practice Pro', firstname:'Test', email:'test@example.com', udf1:'practice', udf2:'pro' };
afterEach(() => vi.unstubAllEnvs());
const configure = () => {
    for (const [key,value] of Object.entries({PAYU_ENV:'test',PAYU_MERCHANT_KEY:'merchant',PAYU_MERCHANT_SALT:'salt',PAYU_CALLBACK_ORIGIN:'https://billing.example.com',PAYU_ZION_ENABLED:'true',PAYU_ZION_TOKEN:'test-token'})) vi.stubEnv(key,value);
};
describe('PayU protocol and access verification', () => {
    it('matches request hashing including recurring consent details', () => {
        const raw = 'merchant|order123|100.00|Practice Pro|Test|test@example.com|practice|pro|||||||||';
        expect(paymentHash(fields,'salt')).toBe(sha512(raw+'salt'));
        expect(paymentHash({...fields,si_details:'{"billingCycle":"MONTHLY"}'},'salt')).toBe(sha512(raw+'{"billingCycle":"MONTHLY"}|salt'));
    });
    it('rejects forged callbacks and supports additional charges', () => {
        const response={...fields,status:'success'};
        expect(responseHash(response,'salt')).toBe(sha512('salt|success|||||||||pro|practice|test@example.com|Test|Practice Pro|100.00|order123|merchant'));
        response.hash=responseHash(response,'salt');
        expect(validResponseHash(response,'salt')).toBe(true);
        expect(validResponseHash({...response,amount:'1.00'},'salt')).toBe(false);
        expect(validResponseHash({...response,hash:'invalid'},'salt')).toBe(false);
        expect(responseHash({...response,additionalCharges:'2.00'},'salt')).toBe(sha512('2.00|salt|success|||||||||pro|practice|test@example.com|Test|Practice Pro|100.00|order123|merchant'));
    });
    it('verifies through the fixed provider endpoint without sending the salt', async () => {
        configure();
        const request=vi.fn(async () => ({ok:true,json:async()=>({status:1,transaction_details:{order123:{status:'success'}}})}));
        await verifyPayment('order123',request);
        const [url,options]=request.mock.calls[0];
        expect(url).toBe('https://test.payu.in/merchant/postservice.php?form=2');
        expect(options.body.get('hash')).toBe(sha512('merchant|verify_payment|order123|salt'));
        expect(options.body.has('salt')).toBe(false);
        expect(options.redirect).toBe('error');
    });
    it('requires captured payments matching the stored amount', () => {
        const paid={status:'success',unmappedstatus:'captured',mihpayid:'123',amt:'100.00'};
        expect(()=>validateVerifiedPayment({amount:10000},paid)).not.toThrow();
        for(const change of [{amt:'1.00'},{status:'pending'},{unmappedstatus:'auth'},{mihpayid:''}]) expect(()=>validateVerifiedPayment({amount:10000},{...paid,...change})).toThrow();
    });
    it('signs Zion creation and cancellation independently', async () => {
        configure();
        const request=vi.fn(async()=>({ok:true,status:204}));
        await zionRequest('POST','',{subscriptionPlans:[{planId:'plan-1'}]},request);
        expect(request.mock.calls[0][1].headers['X-PayU-Subscription-Signature']).toBe(sha512('merchantId:merchant|subscriptionPlanIds:[plan-1]|salt'));
        await zionRequest('DELETE','sub-1',undefined,request);
        expect(request.mock.calls[1][1].headers['X-PayU-Subscription-Signature']).toBe(sha512('merchantId:merchant|subscriptionId:sub-1|salt'));
    });
    it('clamps monthly periods at month end',()=>expect(nextMonth(new Date('2026-01-31T12:00:00Z')).toISOString()).toBe('2026-02-28T12:00:00.000Z'));
});

describe('PayU service prices', () => {
    it('preserves approved INR prices when no environment override exists', () => {
        for (const [product, plan, name, amount] of [['practice','pro','PRACTICE_PRO',69900],['hiring','pilot','HIRING_PILOT',299900],['hiring','starter','HIRING_STARTER',999900],['hiring','growth','HIRING_GROWTH',2999900]]) {
            vi.stubEnv(`PAYU_${name}_AMOUNT_PAISE`, undefined);
            expect(getPayuPrice(product,plan)).toMatchObject({unitAmount:amount,currency:'inr'});
        }
    });
    it('uses configured prices and rejects invalid overrides', () => {
        vi.stubEnv('PAYU_PRACTICE_PRO_AMOUNT_PAISE','79900');
        expect(getPayuPrice('practice','pro').unitAmount).toBe(79900);
        for (const value of ['', '-100', '699.00', 'NaN']) {
            vi.stubEnv('PAYU_PRACTICE_PRO_AMOUNT_PAISE',value);
            expect(getPayuPrice('practice','pro')).toBeNull();
        }
        expect(getPayuPrice('practice','unknown')).toBeNull();
    });
});
