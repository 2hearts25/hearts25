import { PDFDocument, rgb } from "npm:@cantoo/pdf-lib@2.11.1";
import * as fontkit from "npm:fontkit@2.0.4";
import { buildEnrollmentPdf } from "../../supabase/functions/submit-enrollment/pdf.mjs";
import schema from "../../supabase/functions/submit-enrollment/schema.gen.ts";
import en from "../../supabase/functions/submit-enrollment/en.gen.ts";
import { sample } from "./sample-data.mjs";
const d = "/home/claude/hearts25/public/assets/fonts/";
const fonts = { notoRegular: await Deno.readFile(d+"NotoSans-Regular.subset.ttf"), notoBold: await Deno.readFile(d+"NotoSans-Bold.subset.ttf"), cairoRegular: await Deno.readFile(d+"Cairo-Regular.subset.ttf"), cairoBold: await Deno.readFile(d+"Cairo-Bold.subset.ttf") };
const png = new Uint8Array(await Deno.readFile("sig-sample.png"));
for (let i=0;i<3;i++){ const t0=performance.now(); const c0=Deno.cpuUsage?.();
 const r = await buildEnrollmentPdf({lib:{PDFDocument,rgb,fontkit},fonts,schema,en,data:sample,meta:{applicationId:"H2H-TEST",submittedAt:new Date().toISOString(),language:"ar",languageName:"Arabic",formVersion:"1.2.0-E1",acks:["accuracy"],signatures:[{role:"parent1",name:"Test",relation:"Mother",method:"drawn",png,signedAt:new Date().toISOString()}],parent2Mode:"later"}});
 console.log("run",i,"ms",Math.round(performance.now()-t0),"pages",r.pageCount,"bytes",r.bytes.length); }
