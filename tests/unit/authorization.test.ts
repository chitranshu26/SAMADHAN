import { describe, it, expect } from 'vitest';
import { scope, verifyPassword } from '../../src/lib/security/auth';
import { hashPassword } from '../../src/lib/database/db';
import { allowedActions, investigationType } from '../../src/lib/workflow';
import type { User } from '../../src/types';
const user=(role:string,extra={})=>({id:`test-${role}`,role,officer_id:`officer-${role}`,bureau_id:'PGRC',complainant_id:'person-a',region_id:null,verified:true,active:true,...extra}) as User;
const complaint=(stage:number,extra={})=>({current_stage:stage,dealing_assistant_id:'officer-da',special_approval_required:false,...extra});
describe('server role scopes',()=>{
 it('restricts complainants to their own identity',()=>expect(scope(user('complainant'))).toEqual({sql:'c.complainant_id=$1',params:['person-a']}));
 it('restricts caseworkers to assigned cases',()=>expect(scope(user('da')).params).toEqual(['officer-da']));
 it('restricts bureau managers by bureau and configured region',()=>expect(scope(user('director',{region_id:'NRO'}))).toEqual({sql:'c.current_bureau_id=$1 AND c.region_id=$2',params:['PGRC','NRO']}));
 it('separates infrastructure administration from case content',()=>expect(scope(user('admin')).sql).toBe('FALSE'));
 it('gives leadership aggregate scope',()=>expect(scope(user('chairman')).sql).toBe('TRUE'));
});
describe('workflow authority',()=>{
 it('requires the assigned DA and prevents premature or skipped stages',()=>{
  expect(allowedActions(user('da'),complaint(1))).toContain('notice');
  expect(allowedActions(user('da'),complaint(1))).not.toContain('recommend');
  expect(allowedActions(user('da',{officer_id:'other'}),complaint(1))).not.toContain('notice');
 });
 it('prevents DA self approval',()=>expect(allowedActions(user('da'),complaint(5))).not.toContain('approve'));
 it('reserves special approval for Director',()=>{
  expect(allowedActions(user('so'),complaint(5,{special_approval_required:true}))).not.toContain('approve');
  expect(allowedActions(user('director'),complaint(5,{special_approval_required:true}))).toContain('approve');
 });
 it('grants ordinary approval to SO',()=>expect(allowedActions(user('so'),complaint(5))).toContain('approve'));
 it('keeps leadership and admin read or infrastructure only',()=>{
  for(const role of ['chairman','admin'])expect(allowedActions(user(role),complaint(1))).toEqual([]);
 });
 it('allows reopening request only after closure',()=>{
  expect(allowedActions(user('complainant'),complaint(3))).not.toContain('reopen_request');
  expect(allowedActions(user('complainant'),complaint(6))).toContain('reopen_request');
 });
 it('uses category-specific investigation types',()=>{
  expect(investigationType('FEE')).toBe('REFUND_VERIFICATION');
  expect(investigationType('RAG')).toBe('EMERGENCY_SAFETY_INQUIRY');
  expect(investigationType('VIG')).toBe('FINANCIAL_AUDIT');
 });
});
describe('password handling',()=>{
 it('salts hashes and verifies valid passwords only',()=>{
  const first=hashPassword('Test-password-947!');const second=hashPassword('Test-password-947!');
  expect(first).not.toBe(second);expect(first).not.toContain('Test-password');
  expect(verifyPassword('Test-password-947!',first)).toBe(true);
  expect(verifyPassword('wrong-password',first)).toBe(false);
  expect(verifyPassword('Test-password-947!','malformed')).toBe(false);
 });
});
