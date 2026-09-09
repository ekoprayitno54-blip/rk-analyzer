import * as XLSX from 'xlsx'
import { BankTx, Redemption, Settlement } from './types'

export const rupiah = (n:number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0)
export const fmtDate = (s:string) => { if(!s) return '-'; const d=new Date(s); return Number.isNaN(d.getTime())?s:new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d) }
export const uid = () => crypto.randomUUID()
const text=(v:any)=>String(v??'').trim()

// Mendukung format Indonesia (2.400.000,00) dan format bank/Mandiri (2,400,000.00).
export const num=(v:any)=>{
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

const monthMap:Record<string,number>={
 jan:1,januari:1,january:1,feb:2,februari:2,february:2,mar:3,maret:3,march:3,apr:4,april:4,
 mei:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,agu:8,agustus:8,august:8,sep:9,september:9,
 okt:10,oktober:10,oct:10,october:10,nov:11,november:11,des:12,desember:12,dec:12,december:12,
}

const localIso=(y:number,m:number,d:number,h=12,mi=0,se=0)=>{
 const dt=new Date(y,m-1,d,h,mi,se)
 return Number.isNaN(dt.getTime())?'':dt.toISOString()
}

const dateVal=(v:any, fallbackYear?:number, fallbackMonth?:number)=>{
 if(v===null||v===undefined||v==='') return ''
 if(typeof v==='number'){
   // Nilai 1-31 diperlakukan sebagai tanggal harian bila bulan/tahun diberikan.
   if(Number.isInteger(v)&&v>=1&&v<=31&&fallbackYear&&fallbackMonth) return localIso(fallbackYear,fallbackMonth,v)
   const d=XLSX.SSF.parse_date_code(v); if(d) return localIso(d.y,d.m,d.d,d.H||12,d.M||0,d.S||0)
 }
 const s=text(v).replace(/\s+/g,' ')
 if(/^\d{1,2}$/.test(s)&&fallbackYear&&fallbackMonth) return localIso(fallbackYear,fallbackMonth,Number(s))
 let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?$/)
 if(m){ let y=Number(m[3]); if(y<100)y+=2000; return localIso(y,Number(m[2]),Number(m[1]),Number(m[4]||12),Number(m[5]||0),Number(m[6]||0)) }
 m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?/)
 if(m){ const mon=monthMap[m[2].toLowerCase()]; if(mon)return localIso(Number(m[3]),mon,Number(m[1]),Number(m[4]||12),Number(m[5]||0),Number(m[6]||0)) }
 const d=new Date(s); return Number.isNaN(d.getTime())?'':d.toISOString()
}

export const dateKey=(s:string)=>{
 if(!s)return ''
 const d=new Date(s); if(Number.isNaN(d.getTime()))return ''
 const p=(n:number)=>String(n).padStart(2,'0')
 return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

export const inDateRange=(s:string,from?:string,to?:string)=>{
 const k=dateKey(s); if(!k)return false
 return (!from||k>=from)&&(!to||k<=to)
}

export async function readRows(file:File){ const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json<any>(ws,{defval:''}) }
const fnv=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}

export async function parseBank(file:File):Promise<BankTx[]>{ const rows=await readRows(file); return rows.map(r=>{
 const x={id:uid(), date:dateVal(pick(r,['date & time','tanggal','date'])), description:text(pick(r,['description','uraian','keterangan','remark'])), debit:num(pick(r,['debit'])), credit:num(pick(r,['credit','kredit'])), balance:num(pick(r,['balance','saldo'])), account:text(pick(r,['account no.','account no','rekening'])), reference:text(pick(r,['reference no','reference','referensi']))};
 return {...x,fingerprint:fnv([x.date,x.description,x.debit,x.credit,x.balance,x.account,x.reference].join('|').toLowerCase())}
 }).filter(x=>x.date && (x.debit||x.credit||x.description)) }

export async function parseSettlements(file:File):Promise<Settlement[]>{ const rows=await readRows(file); return rows.map(r=>({
 id:uid(), date:dateVal(pick(r,['tanggal bayar','tanggal','date'])), total:num(pick(r,['total pembayaran','total','nominal','setoran','jumlah'])),
 label:text(pick(r,['nama retailer','keterangan','nama','label','jenis','sales','pelanggan']))||'Setoran', source:file.name
})).filter(x=>x.date&&x.total>0) }

export async function parseRedemptions(file:File):Promise<Redemption[]>{ const rows=await readRows(file); return rows.map(r=>({
 id:uid(), date:dateVal(pick(r,['tanggal','date','tanggal do','tanggal pengisian'])), product:text(pick(r,['produk','nama produk','jenis','product']))||'Produk',
 qty:num(pick(r,['qty','volume','jumlah','12 kg','12kg','5,5 kg','50 kg'])), unit:text(pick(r,['satuan','unit']))||'',
 total:num(pick(r,['total harga','total','nominal','nilai','tebusan'])), doNo:text(pick(r,['nomor do','no do','do no','nomor lo','lo no'])), source:file.name
})).filter(x=>x.date&&x.total>0) }

// Parser grid untuk copy-paste Excel. Mendukung tab, newline di dalam quoted cell, dan quote ganda.
export function parsePasteGrid(input:string):string[][]{
 const out:string[][]=[]; let row:string[]=[], cell='', quoted=false
 const s=input.replace(/^\uFEFF/,'')
 for(let i=0;i<s.length;i++){
   const ch=s[i]
   if(ch==='"'){
     if(quoted&&s[i+1]==='"'){cell+='"';i++} else quoted=!quoted
   }else if(!quoted&&ch==='\t'){row.push(cell.trim());cell=''}
   else if(!quoted&&(ch==='\n'||ch==='\r')){
     if(ch==='\r'&&s[i+1]==='\n')i++
     row.push(cell.trim());cell=''
     if(row.some(x=>x!==''))out.push(row)
     row=[]
   }else cell+=ch
 }
 row.push(cell.trim()); if(row.some(x=>x!==''))out.push(row)
 return out
}

const norm=(s:any)=>text(s).toLowerCase().replace(/\s+/g,' ').trim()
const headerIndex=(row:string[], variants:string[])=>row.findIndex(c=>variants.some(v=>norm(c).includes(v)))
const rowDay=(v:any)=>{const n=num(v);return Number.isInteger(n)&&n>=1&&n<=31?n:0}
const source=(name:string)=>`Paste • ${name}`

export type PasteResult<T>={rows:T[];ignored:number;format:string;total:number;warnings:string[]}

export function parsePastedSettlements(input:string,year:number,month:number):PasteResult<Settlement>{
 const g=parsePasteGrid(input), warnings:string[]=[]
 if(!g.length)return {rows:[],ignored:0,format:'Tidak dikenali',total:0,warnings:['Tidak ada data yang ditempel.']}
 const all=g.map(r=>r.map(norm))
 let rows:Settlement[]=[], ignored=0, format='Setoran umum'

 // Report Order LPG 3 Kg / Pertamina.
 const reportIdx=all.findIndex(r=>r.some(x=>x.includes('total pembayaran'))&&r.some(x=>x.includes('status transaksi')))
 if(reportIdx>=0){
   format='Report Order LPG 3 Kg'
   const h=g[reportIdx], iDate=headerIndex(h,['tanggal bayar']), iName=headerIndex(h,['nama retailer']), iAcc=headerIndex(h,['nama rekening sumber']), iQty=headerIndex(h,['qty']), iTotal=headerIndex(h,['total pembayaran']), iStatus=headerIndex(h,['status transaksi']), iId=headerIndex(h,['id transaksi'])
   for(const r of g.slice(reportIdx+1)){
     if(iStatus>=0&&!norm(r[iStatus]).includes('berhasil')){ignored++;continue}
     const date=dateVal(r[iDate],year,month), total=num(r[iTotal]); if(!date||total<=0){ignored++;continue}
     const parts=[r[iName],iQty>=0&&num(r[iQty])?`${num(r[iQty])} tabung`:'',r[iAcc]].filter(Boolean)
     rows.push({id:uid(),date,total,label:parts.join(' • ')||`Setoran ${r[iId]||''}`,source:source(format)})
   }
   warnings.push('Baris berstatus Pembayaran Gagal otomatis diabaikan.')
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // Rekap Setoran SPBU: Setoran 1..5 + LinkAja + Total. Total tidak dibuat ulang agar tidak double count.
 const spbuIdx=all.findIndex(r=>r.some(x=>x.includes('setoran 1'))&&r.some(x=>x.includes('total')))
 if(spbuIdx>=0){
   format='Rekap Setoran SPBU'
   const h=g[spbuIdx], dateI=headerIndex(h,['tanggal','tgl']), componentIdx=h.map((x,i)=>({x:norm(x),i})).filter(o=>/^setoran\s*\d+/.test(o.x)||o.x.includes('link aja')||o.x.includes('linkaja'))
   for(const r of g.slice(spbuIdx+1)){
     const d=rowDay(r[dateI]); if(!d){if(r.some(x=>num(x)>0))ignored++;continue}
     const date=dateVal(d,year,month)
     for(const c of componentIdx){const total=num(r[c.i]);if(total>0)rows.push({id:uid(),date,total,label:c.x.includes('link')?'LINKAJA':c.x.replace(/^./,m=>m.toUpperCase()),source:source(format)})}
   }
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // Rekap setoran/penjualan LPG non-subsidi per sales/pelanggan.
 const lpgSalesIdx=all.findIndex(r=>r.some(x=>x.includes('nama sales'))&&r.some(x=>x.includes('harga satuan'))&&r.some(x=>x==='total'||x.includes('total')))
 if(lpgSalesIdx>=0){
   format='Rekap Setoran LPG Non Subsidi'
   const h=g[lpgSalesIdx], iDate=headerIndex(h,['tanggal']), iSales=headerIndex(h,['nama sales']), iCust=headerIndex(h,['nama pelanggan']), i12=headerIndex(h,['12kg','12 kg']), i50=headerIndex(h,['50kg','50 kg']), i55=headerIndex(h,['5,5kg','5,5 kg','55kg']), iTotal=headerIndex(h,['total'])
   for(const r of g.slice(lpgSalesIdx+1)){
     const date=dateVal(r[iDate],year,month), total=num(r[iTotal]);if(!date||total<=0){ignored++;continue}
     const prod:string[]=[];if(i12>=0&&num(r[i12]))prod.push(`12kg ${num(r[i12])}`);if(i50>=0&&num(r[i50]))prod.push(`50kg ${num(r[i50])}`);if(i55>=0&&num(r[i55]))prod.push(`5,5kg ${num(r[i55])}`)
     const label=[r[iSales],r[iCust],prod.join(' + ')].filter(Boolean).join(' • ')
     rows.push({id:uid(),date,total,label:label||'Setoran LPG Non Subsidi',source:source(format)})
   }
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // Fallback: cari header Tanggal + Total/Nominal/Setoran.
 const genericIdx=all.findIndex(r=>r.some(x=>x==='tanggal'||x==='tgl'||x==='date')&&r.some(x=>x.includes('total')||x.includes('nominal')||x.includes('setoran')))
 if(genericIdx>=0){
   const h=g[genericIdx], iDate=headerIndex(h,['tanggal','tgl','date']), iTotal=headerIndex(h,['total','nominal','setoran','jumlah']), iLabel=headerIndex(h,['keterangan','nama','sales','pelanggan','label'])
   for(const r of g.slice(genericIdx+1)){const date=dateVal(r[iDate],year,month),total=num(r[iTotal]);if(!date||total<=0){ignored++;continue}rows.push({id:uid(),date,total,label:iLabel>=0&&r[iLabel]?r[iLabel]:'Setoran',source:source(format)})}
 }else warnings.push('Header setoran belum dikenali. Sertakan baris judul kolom saat copy dari Excel.')
 return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
}

export function parsePastedRedemptions(input:string,year:number,month:number):PasteResult<Redemption>{
 const g=parsePasteGrid(input), warnings:string[]=[]
 if(!g.length)return {rows:[],ignored:0,format:'Tidak dikenali',total:0,warnings:['Tidak ada data yang ditempel.']}
 const all=g.map(r=>r.map(norm)); let rows:Redemption[]=[],ignored=0,format='Tebusan umum'

 // LPG non-subsidi: dua baris header, blok qty 12kg/50kg/12BG/55kg dan total harga paling kanan.
 const lpgTop=all.findIndex(r=>r.some(x=>x.includes('tebusan dalam tabung'))&&r.some(x=>x.includes('total harga')))
 if(lpgTop>=0){
   format='Rekap Tebusan LPG Non Subsidi'
   const h2=g[lpgTop+1]||[], productCols=h2.map((x,i)=>({name:text(x),i})).filter(o=>o.i>0&&o.i<=4&&o.name)
   const totalI=(g[lpgTop]||[]).reduce((last,x,i)=>norm(x).includes('total harga')?i:last,-1)
   const fallbackTotalI=Math.max(...g.slice(lpgTop+2).map(r=>r.length-1),0)
   for(const r of g.slice(lpgTop+2)){
     const d=rowDay(r[0]);if(!d)continue
     const total=num(r[totalI>=0?totalI:fallbackTotalI]);if(total<=0){ignored++;continue}
     const parts=productCols.map(c=>({name:c.name,qty:num(r[c.i])})).filter(x=>x.qty>0)
     rows.push({id:uid(),date:dateVal(d,year,month),product:parts.map(x=>`${x.name} ${x.qty}`).join(' + ')||'LPG Non Subsidi',qty:parts.reduce((a,b)=>a+b.qty,0),unit:'tabung',total,source:source(format)})
   }
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // SPBU: dua baris header (Tanggal/Tebusan/Total lalu Premium/Solar/Pertamax/Pertalite/Dexlite).
 const spbuTop=all.findIndex((r,i)=>r.some(x=>x==='tanggal'||x==='tgl')&&i+1<all.length&&all[i+1].some(x=>['premium','solar','pertamax','pertalite','dexlite'].some(p=>x.includes(p))))
 if(spbuTop>=0){
   format='Rekap Tebusan SPBU'
   const h2=g[spbuTop+1], products=h2.map((x,i)=>({name:text(x),i})).filter(o=>['premium','solar','pertamax','pertalite','dexlite','bio solar','pertamina dex'].some(p=>norm(o.name).includes(p)))
   const totalI=(g[spbuTop]||[]).reduce((last,x,i)=>norm(x).includes('total')?i:last,-1)
   for(const r of g.slice(spbuTop+2)){
     const d=rowDay(r[0]);if(!d)continue
     const total=num(r[totalI>=0?totalI:r.length-1]);if(total<=0){ignored++;continue}
     const parts=products.map(c=>({name:c.name,qty:num(r[c.i])})).filter(x=>x.qty>0)
     rows.push({id:uid(),date:dateVal(d,year,month),product:parts.map(x=>`${x.name} ${x.qty>=1000?`${x.qty/1000} KL`:x.qty}`).join(' + ')||'Tebusan SPBU',qty:parts.reduce((a,b)=>a+b.qty,0),unit:'liter',total,source:source(format)})
   }
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // LPG 3kg: Tgl | Tebusan | Harga, baris kedua lazimnya berisi "3kg".
 const lpg3Top=all.findIndex(r=>r.some(x=>x==='tgl'||x==='tanggal')&&r.some(x=>x.includes('tebusan'))&&r.some(x=>x.includes('harga')))
 if(lpg3Top>=0){
   format='Rekap Tebusan LPG 3 Kg'
   const h=g[lpg3Top], dateI=headerIndex(h,['tgl','tanggal']), qtyI=headerIndex(h,['tebusan']), totalI=headerIndex(h,['harga'])
   for(const r of g.slice(lpg3Top+1)){
     const d=rowDay(r[dateI]);if(!d)continue
     const qty=num(r[qtyI]),total=num(r[totalI]);if(qty<=0||total<=0){ignored++;continue}
     rows.push({id:uid(),date:dateVal(d,year,month),product:'LPG 3 Kg',qty,unit:'tabung',total,source:source(format)})
   }
   return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
 }

 // Fallback format baris biasa.
 const genericIdx=all.findIndex(r=>r.some(x=>x==='tanggal'||x==='tgl'||x==='date')&&r.some(x=>x.includes('total')||x.includes('harga')))
 if(genericIdx>=0){
   const h=g[genericIdx],iDate=headerIndex(h,['tanggal','tgl','date']),iProduct=headerIndex(h,['produk','jenis','product']),iQty=headerIndex(h,['qty','volume','jumlah']),iUnit=headerIndex(h,['unit','satuan']),iTotal=headerIndex(h,['total','harga','nominal','nilai']),iDo=headerIndex(h,['nomor do','no do','do/lo','do','lo'])
   for(const r of g.slice(genericIdx+1)){const date=dateVal(r[iDate],year,month),total=num(r[iTotal]);if(!date||total<=0){ignored++;continue}rows.push({id:uid(),date,product:iProduct>=0&&r[iProduct]?r[iProduct]:'Produk',qty:iQty>=0?num(r[iQty]):0,unit:iUnit>=0?r[iUnit]:'',total,doNo:iDo>=0?r[iDo]:'',source:source(format)})}
 }else warnings.push('Header tebusan belum dikenali. Sertakan baris judul kolom saat copy dari Excel.')
 return {rows,ignored,format,total:rows.reduce((a,b)=>a+b.total,0),warnings}
}

const days=(a:string,b:string)=>Math.abs((new Date(a).getTime()-new Date(b).getTime())/86400000)

type ComboCandidate=(Settlement|Redemption)&{kind:'setoran'|'tebusan';dd:number}
function findCombination(candidates:any[],amount:number,txDate:string){
 if(!amount)return null
 const near:ComboCandidate[]=candidates.map(c=>({...c,dd:days(c.date,txDate)})).filter(c=>c.dd<=3&&c.total>0&&c.total<=amount+1).sort((a,b)=>a.dd-b.dd||Math.abs(amount-b.total)-Math.abs(amount-a.total)).slice(0,24)
 let best:any=null
 const accept=(parts:ComboCandidate[])=>{const sum=parts.reduce((a,b)=>a+b.total,0),diff=Math.abs(sum-amount);if(diff>1)return;const maxdd=Math.max(...parts.map(x=>x.dd));const score=94-maxdd*3-parts.length;if(!best||score>best.score)best={parts,sum,diff,score}}
 for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++)accept([near[i],near[j]])
 const tri=near.slice(0,18);for(let i=0;i<tri.length;i++)for(let j=i+1;j<tri.length;j++)for(let k=j+1;k<tri.length;k++)accept([tri[i],tri[j],tri[k]])
 return best
}

export function classify(bank:BankTx[], settlements:Settlement[], redemptions:Redemption[]){
 return bank.map(tx=>{
  const amount=tx.debit||tx.credit; const candidates:any[]=tx.debit?redemptions.map(r=>({...r,kind:'tebusan' as const})):settlements.map(s=>({...s,kind:'setoran' as const}));
  let best:any=null; for(const c of candidates){ const diff=Math.abs(c.total-amount); const dd=days(c.date,tx.date); const score=(diff===0?75:Math.max(0,50-(diff/Math.max(amount,1))*100)) + (dd===0?25:dd<=1?18:dd<=3?8:0); if(dd<=3 && (!best||score>best.score)) best={...c,diff,dd,score} }
  let note='',category='',status:'matched'|'partial'|'review'|'unmatched'='unmatched',matchSource='Heuristik',confidence=25,difference=0;
  if(best && best.score>=80){ status=best.diff===0?'matched':'partial'; confidence=Math.min(99,Math.round(best.score)); difference=best.diff; if(best.kind==='tebusan'){ category='Penebusan Produk'; note=`Penebusan ${best.product}${best.qty?` ${best.qty}${best.unit?` ${best.unit}`:''}`:''}${best.doNo?` • DO ${best.doNo}`:''}`; matchSource=`Tabel Tebusan • ${best.source||''}` } else { category='Setoran'; note=`Setoran ${best.label}`; matchSource=`Tabel Setoran • ${best.source||''}` }
  } else {
   const combo=findCombination(candidates,amount,tx.date)
   if(combo){
     status='matched';confidence=Math.max(85,Math.round(combo.score));difference=combo.diff
     const isDebit=!!tx.debit;category=isDebit?'Penebusan Produk':'Setoran'
     note=`Gabungan ${combo.parts.length} ${isDebit?'tebusan':'setoran'}: `+combo.parts.map((p:any)=>isDebit?p.product:p.label).join(' + ')
     matchSource=`Gabungan Tabel ${isDebit?'Tebusan':'Setoran'}`
   }else{
     const d=norm(tx.description); if(tx.credit && (d.includes('qris')||d.includes('merchant'))){category='Penerimaan QRIS';note='Penerimaan QRIS/merchant';confidence=70;status='review'}
     else if(d.includes('pertamina') && tx.debit){category='Penebusan Produk';note='Kemungkinan pembayaran penebusan produk Pertamina';confidence=65;status='review'}
     else if((d.includes('setor')||d.includes('cash deposit'))&&tx.credit){category='Setoran';note='Kemungkinan setoran penjualan/setoran tunai';confidence=62;status='review'}
     else if(d.includes('loan')||d.includes('pinjaman')){category='Pinjaman';note=tx.credit?'Pinjaman/dana masuk':'Pembayaran/pengembalian pinjaman';confidence=60;status='review'}
     else if(d.includes('pln')||d.includes('listrik')){category='Biaya Operasional';note='Pembayaran listrik';confidence=80;status='matched'}
     else {category='Belum Diklasifikasi';note='Belum ditemukan data pembanding yang meyakinkan';confidence=20;status='unmatched'}
   }
  }
  return {...tx,internalNote:tx.internalNote||note,category,matchStatus:status,matchSource,confidence,difference}
 })
}

export function toCSV(rows:BankTx[]){ const esc=(v:any)=>`"${String(v??'').replaceAll('"','""')}"`; const h=['Tanggal','Uraian Bank','Debit','Kredit','Saldo','Kategori','Keterangan Internal','Status','Sumber','Keyakinan','Selisih']; return [h.join(','),...rows.map(r=>[r.date,r.description,r.debit,r.credit,r.balance,r.category,r.internalNote,r.matchStatus,r.matchSource,r.confidence,r.difference].map(esc).join(','))].join('\n') }
