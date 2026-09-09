import { supabase } from './supabase'
import type { BankTx, Redemption, Settlement, UnitType } from './types'

export type RkUnit = { id:string; name:string; unitType:UnitType; organizationId:string }

const chunks = <T,>(rows:T[], size=400) => Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size))
const sourceType = (kind:'bank'|'settlement'|'redemption') => kind==='bank'?'BANK':kind==='settlement'?'SETORAN':'TEBUSAN'

export async function loadUnits():Promise<RkUnit[]> {
  const {data,error}=await supabase.from('rk_units').select('id,name,unit_type,organization_id').eq('active',true).order('name')
  if(error) throw error
  return (data||[]).map((x:any)=>({id:x.id,name:x.name,unitType:x.unit_type,organizationId:x.organization_id}))
}

export async function bootstrapUnits():Promise<RkUnit[]> {
  const current=await loadUnits(); if(current.length) return current
  const {data:org,error:orgErr}=await supabase.from('rk_organizations').insert({name:'RK Analyzer'}).select('id').single()
  if(orgErr) throw orgErr
  const {error:unitErr}=await supabase.from('rk_units').insert([
    {organization_id:org.id,name:'SPBU Utama',unit_type:'SPBU'},
    {organization_id:org.id,name:'LPG Utama',unit_type:'LPG'},
  ])
  if(unitErr) throw unitErr
  return loadUnits()
}

export async function addUnit(name:string, unitType:UnitType):Promise<RkUnit> {
  let units=await loadUnits(); let organizationId=units[0]?.organizationId
  if(!organizationId){ units=await bootstrapUnits(); organizationId=units[0].organizationId }
  const {data,error}=await supabase.from('rk_units').insert({organization_id:organizationId,name,unit_type:unitType}).select('id,name,unit_type,organization_id').single()
  if(error) throw error
  return {id:data.id,name:data.name,unitType:data.unit_type,organizationId:data.organization_id}
}

export async function loadUnitData(unitId:string){
  const [b,s,r]=await Promise.all([
    supabase.from('rk_bank_transactions').select('id,txn_at,description,debit,credit,balance,reference_no,internal_note').eq('unit_id',unitId).order('txn_at',{ascending:true}).limit(5000),
    supabase.from('rk_settlements').select('id,settlement_at,label,total,source_ref').eq('unit_id',unitId).order('settlement_at',{ascending:true}).limit(5000),
    supabase.from('rk_redemptions').select('id,redemption_at,product,qty,unit,total,do_no,source_ref').eq('unit_id',unitId).order('redemption_at',{ascending:true}).limit(5000),
  ])
  if(b.error) throw b.error; if(s.error) throw s.error; if(r.error) throw r.error
  const bank:BankTx[]=(b.data||[]).map((x:any)=>({id:x.id,date:x.txn_at,description:x.description||'',debit:Number(x.debit||0),credit:Number(x.credit||0),balance:Number(x.balance||0),reference:x.reference_no||'',internalNote:x.internal_note||''}))
  const settlements:Settlement[]=(s.data||[]).map((x:any)=>({id:x.id,date:x.settlement_at,label:x.label||'Setoran',total:Number(x.total||0),source:x.source_ref||''}))
  const redemptions:Redemption[]=(r.data||[]).map((x:any)=>({id:x.id,date:x.redemption_at,product:x.product||'Produk',qty:Number(x.qty||0),unit:x.unit||'',total:Number(x.total||0),doNo:x.do_no||'',source:x.source_ref||''}))
  return {bank,settlements,redemptions}
}

export async function createBatch(unitId:string, kind:'bank'|'settlement'|'redemption', file:File, rowCount:number){
  const {data,error}=await supabase.from('rk_import_batches').insert({unit_id:unitId,source_type:sourceType(kind),file_name:file.name,row_count:rowCount}).select('id').single()
  if(error) throw error
  return data.id as string
}

export async function insertBank(unitId:string,batchId:string,rows:BankTx[]){
  for(const part of chunks(rows)){
    const payload=part.map(x=>({unit_id:unitId,batch_id:batchId,txn_at:x.date,description:x.description,reference_no:x.reference||null,debit:x.debit||0,credit:x.credit||0,balance:x.balance||null,fingerprint:x.fingerprint||null,raw_data:{account:x.account||null}}))
    const {error}=await supabase.from('rk_bank_transactions').upsert(payload,{onConflict:'owner_id,unit_id,fingerprint',ignoreDuplicates:true}); if(error) throw error
  }
}
export async function insertSettlements(unitId:string,batchId:string,rows:Settlement[]){
  for(const part of chunks(rows)){
    const {error}=await supabase.from('rk_settlements').insert(part.map(x=>({unit_id:unitId,batch_id:batchId,settlement_at:x.date,label:x.label,total:x.total,source_ref:x.source||null}))); if(error) throw error
  }
}
export async function insertRedemptions(unitId:string,batchId:string,rows:Redemption[]){
  for(const part of chunks(rows)){
    const {error}=await supabase.from('rk_redemptions').insert(part.map(x=>({unit_id:unitId,batch_id:batchId,redemption_at:x.date,product:x.product,qty:x.qty||0,unit:x.unit||null,total:x.total,do_no:x.doNo||null,source_ref:x.source||null}))); if(error) throw error
  }
}

export async function updateInternalNote(id:string, note:string){
  const {error}=await supabase.from('rk_bank_transactions').update({internal_note:note,updated_at:new Date().toISOString()}).eq('id',id)
  if(error) throw error
  await supabase.from('rk_audit_logs').insert({entity_type:'bank_transaction',entity_id:id,action:'UPDATE_INTERNAL_NOTE',new_value:{internal_note:note}})
}

export async function deleteBankData(unitId:string){
  const {error:txErr}=await supabase.from('rk_bank_transactions').delete().eq('unit_id',unitId)
  if(txErr) throw txErr
  const {error:batchErr}=await supabase.from('rk_import_batches').delete().eq('unit_id',unitId).eq('source_type','BANK')
  if(batchErr) throw batchErr
}


export async function deleteSettlementData(unitId:string){
  const {error:sErr}=await supabase.from('rk_settlements').delete().eq('unit_id',unitId)
  if(sErr) throw sErr
  const {error:bErr}=await supabase.from('rk_import_batches').delete().eq('unit_id',unitId).eq('source_type','SETORAN')
  if(bErr) throw bErr
}

export async function deleteRedemptionData(unitId:string){
  const {error:rErr}=await supabase.from('rk_redemptions').delete().eq('unit_id',unitId)
  if(rErr) throw rErr
  const {error:bErr}=await supabase.from('rk_import_batches').delete().eq('unit_id',unitId).eq('source_type','TEBUSAN')
  if(bErr) throw bErr
}

export async function resetUnitData(unitId:string){
  const {error:bErr}=await supabase.from('rk_bank_transactions').delete().eq('unit_id',unitId); if(bErr) throw bErr
  const {error:sErr}=await supabase.from('rk_settlements').delete().eq('unit_id',unitId); if(sErr) throw sErr
  const {error:rErr}=await supabase.from('rk_redemptions').delete().eq('unit_id',unitId); if(rErr) throw rErr
  const {error:iErr}=await supabase.from('rk_import_batches').delete().eq('unit_id',unitId); if(iErr) throw iErr
}

