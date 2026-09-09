import * as XLSX from 'xlsx'
import { BankTx, Redemption, Settlement } from './types'

export const rupiah = (n:number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0)
export const fmtDate = (s:string) => { if(!s) return '-'; const d=new Date(s); return Number.isNaN(d.getTime())?s:new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d) }
export const uid = () => crypto.randomUUID()
const text=(v:any)=>String(v??'').trim()
const num=(v:any)=>{
 if(typeof v==='number') return Number.isFinite(v)?v:0
 let s=text(v).replace(/\s/g,'').replace(/[^0-9,.-]/g,'')
 if(!s) return 0
 const negative=s.startsWith('-')
 s=s.replace(/-/g,'')
 const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.')
 if(comma>=0 && dot>=0){
   s=dot>comma ? s.replace(/,/g,'') : s.replace(/\./g,'').replace(/,/g,'.')
 }else if(comma>=0){
   const decimals=s.length-comma-1
   s=(decimals===1||decimals===2) ? s.replace(/\./g,'').replace(/,/g,'.') : s.replace(/,/g,'')
 }else if(dot>=0){
   const decimals=s.length-dot-1
   if(!(decimals===1||decimals===2)) s=s.replace(/\./g,'')
 }
 const n=Number((negative?'-':'')+s)
 return Number.isFinite(n)?n:0
}
const lowerKeys=(r:any)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase().replace(/\s+/g,' ').trim(),v]))
const pick=(r:any, keys:string[])=>{ const x=lowerKeys(r); for(const k of Object.keys(x)){ if(keys.some(q=>k.includes(q))) return x[k] } return '' }
const dateVal=(v:any)=>{ if(!v) return ''; if(typeof v==='number'){ const d=XLSX.SSF.parse_date_code(v); if(d) return new Date(d.y,d.m-1,d.d,d.H||0,d.M||0,d.S||0).toISOString() }
  const s=text(v); const m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?/); if(m){ let y=Number(m[3]); if(y<100)y+=2000; return new Date(y,Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0)).toISOString() }
  const d=new Date(s); return Number.isNaN(d.getTime())?'':d.toISOString() }

export async function readRows(file:File){ const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json<any>(ws,{defval:''}) }

const fnv=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}

export async function parseBank(file:File):Promise<BankTx[]>{ const rows=await readRows(file); return rows.map(r=>{
 const x={id:uid(), date:dateVal(pick(r,['date & time','tanggal','date'])), description:text(pick(r,['description','uraian','keterangan','remark'])), debit:num(pick(r,['debit'])), credit:num(pick(r,['credit','kredit'])), balance:num(pick(r,['balance','saldo'])), account:text(pick(r,['account no.','account no','rekening'])), reference:text(pick(r,['reference no','reference','referensi']))};
 return {...x,fingerprint:fnv([x.date,x.description,x.debit,x.credit,x.balance,x.account,x.reference].join('|').toLowerCase())}
 }).filter(x=>x.date && (x.debit||x.credit||x.description)) }

export async function parseSettlements(file:File):Promise<Settlement[]>{ const rows=await readRows(file); return rows.map(r=>({
 id:uid(), date:dateVal(pick(r,['tanggal','date'])), total:num(pick(r,['total','nominal','setoran','jumlah'])),
 label:text(pick(r,['keterangan','nama','label','jenis','sales','pelanggan']))||'Setoran', source:file.name
})).filter(x=>x.date&&x.total>0) }

export async function parseRedemptions(file:File):Promise<Redemption[]>{ const rows=await readRows(file); return rows.map(r=>({
 id:uid(), date:dateVal(pick(r,['tanggal','date','tanggal do','tanggal pengisian'])), product:text(pick(r,['produk','nama produk','jenis','product']))||'Produk',
 qty:num(pick(r,['qty','volume','jumlah','12 kg','12kg','5,5 kg','50 kg'])), unit:text(pick(r,['satuan','unit']))||'',
 total:num(pick(r,['total','nominal','nilai','tebusan'])), doNo:text(pick(r,['nomor do','no do','do no','nomor lo','lo no'])), source:file.name
})).filter(x=>x.date&&x.total>0) }

const days=(a:string,b:string)=>Math.abs((new Date(a).getTime()-new Date(b).getTime())/86400000)
const norm=(s:string)=>s.toLowerCase()

export function classify(bank:BankTx[], settlements:Settlement[], redemptions:Redemption[]){
 return bank.map(tx=>{
  const amount=tx.debit||tx.credit; const candidates=tx.debit?redemptions.map(r=>({...r,kind:'tebusan' as const})):settlements.map(s=>({...s,kind:'setoran' as const}));
  let best:any=null; for(const c of candidates){ const diff=Math.abs(c.total-amount); const dd=days(c.date,tx.date); const score=(diff===0?75:Math.max(0,50-(diff/Math.max(amount,1))*100)) + (dd===0?25:dd<=1?18:dd<=3?8:0); if(dd<=3 && (!best||score>best.score)) best={...c,diff,dd,score} }
  let note='',category='',status:'matched'|'partial'|'review'|'unmatched'='unmatched',source='Heuristik',confidence=25,difference=0;
  if(best && best.score>=80){ status=best.diff===0?'matched':'partial'; confidence=Math.min(99,Math.round(best.score)); difference=best.diff; if(best.kind==='tebusan'){ category='Penebusan Produk'; note=`Penebusan ${best.product}${best.qty?` ${best.qty}${best.unit?` ${best.unit}`:''}`:''}${best.doNo?` • DO ${best.doNo}`:''}`; source=`Tabel Tebusan • ${best.source||''}` } else { category='Setoran'; note=`Setoran ${best.label}`; source=`Tabel Setoran • ${best.source||''}` }
  } else {
   const d=norm(tx.description); if(tx.credit && (d.includes('qris')||d.includes('merchant'))){category='Penerimaan QRIS';note='Penerimaan QRIS/merchant';confidence=70;status='review'}
   else if(d.includes('pertamina') && tx.debit){category='Penebusan Produk';note='Kemungkinan pembayaran penebusan produk Pertamina';confidence=65;status='review'}
   else if((d.includes('setor')||d.includes('cash deposit'))&&tx.credit){category='Setoran';note='Kemungkinan setoran penjualan/setoran tunai';confidence=62;status='review'}
   else if(d.includes('loan')||d.includes('pinjaman')){category='Pinjaman';note=tx.credit?'Pinjaman/dana masuk':'Pembayaran/pengembalian pinjaman';confidence=60;status='review'}
   else if(d.includes('pln')||d.includes('listrik')){category='Biaya Operasional';note='Pembayaran listrik';confidence=80;status='matched'}
   else {category='Belum Diklasifikasi';note='Belum ditemukan data pembanding yang meyakinkan';confidence=20;status='unmatched'}
  }
  return {...tx,internalNote:tx.internalNote||note,category,matchStatus:status,matchSource:source,confidence,difference}
 })
}

export function toCSV(rows:BankTx[]){ const esc=(v:any)=>`"${String(v??'').replaceAll('"','""')}"`; const h=['Tanggal','Uraian Bank','Debit','Kredit','Saldo','Kategori','Keterangan Internal','Status','Sumber','Keyakinan','Selisih']; return [h.join(','),...rows.map(r=>[r.date,r.description,r.debit,r.credit,r.balance,r.category,r.internalNote,r.matchStatus,r.matchSource,r.confidence,r.difference].map(esc).join(','))].join('\n') }
