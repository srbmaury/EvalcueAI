// Temporary local QA server: never reads developer database or provider credentials.
import { readFile } from 'node:fs/promises';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'isolated-demo-qa-secret-not-for-production',PRACTICE_CLIENT_ORIGIN:'http://127.0.0.1:5175',HIRING_CLIENT_ORIGIN:'http://127.0.0.1:5175',ALLOWED_ORIGINS:'http://127.0.0.1:5175',SERVER_ORIGIN:'http://127.0.0.1:5501',API_RATE_LIMIT_MAX:'10000',AUTH_RATE_LIMIT_MAX:'1000',COOKIE_SECURE:'false',COOKIE_SAMESITE:'lax',LOG_LEVEL:'silent'});
// Keep test runs from calling externally configured mail, AI, billing, storage or telemetry services.
for (const key of Object.keys(process.env)) if (/^(OPENAI_|GEMINI_|BREVO_|PAYU_|REDIS_|CLOUDINARY_|SENTRY_|OTEL_|TAVILY_)/.test(key)) delete process.env[key];
const {default:app}=await import('../app.js');
const {default:User}=await import('../models/User.js');
const {default:Organization}=await import('../models/Organization.js');
const {default:Membership}=await import('../models/OrganizationMembership.js');
const manifest=JSON.parse(await readFile(new URL('../../companionai_demo_accounts_manifest.json',import.meta.url),'utf8'));
const database=await MongoMemoryReplSet.create({replSet:{count:1}});
await mongoose.connect(database.getUri());
const users=new Map();
for(const account of manifest.accounts){const user=await User.create({name:account.name,email:account.email,password:manifest.sharedDemoPassword,role:account.platformRole||'user',provider:'local',isVerified:true});users.set(account.email,user);}
for(const definition of manifest.organizations){
 const owner=users.get(definition.ownerEmail);const org=await Organization.create({name:definition.name,createdBy:owner._id,hiringPlan:"trial",hiringTrialEligible:true});
 owner.hiringTrialClaimed=true;await owner.save();
 for(const [email,role] of definition.members) await Membership.create({organization:org._id,user:users.get(email)._id,role,status:'active'});
}
const server=app.listen(5501,'127.0.0.1',()=>console.log('Isolated demo API ready.'));
const stop=async()=>{await new Promise(resolve=>server.close(resolve));await mongoose.disconnect();await database.stop();process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
