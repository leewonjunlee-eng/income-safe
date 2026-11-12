import fs from 'fs';
import { annualPlus, checkPlan } from './rules.js';
const [sy] = JSON.parse(fs.readFileSync('public/data/clients.json', 'utf8'));
const m = JSON.parse(fs.readFileSync('public/data/market.json', 'utf8'));
const ap = annualPlus(sy, m);
const flags = checkPlan(sy, sy.planA, m).filter(r => r.flag).map(r => r.id);
const flagsB = checkPlan(sy, sy.planB, m).filter(r => r.flag).map(r => r.id);
console.log('annualPlus', ap, 'A flags', flags, 'B flags', flagsB);
if (Math.abs(ap - 1210.5) > 0.1 || flags.join() !== 'emergency,period,suit' || flagsB.length) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
