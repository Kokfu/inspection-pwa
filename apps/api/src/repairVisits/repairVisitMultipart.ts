import Busboy from "busboy";
import type { Request } from "express";
import { writeFile, unlink } from "node:fs/promises";
import { attachmentMaxBytes, createAttachmentTempPath } from "../attachments/attachmentStorage.js";
import { RepairError } from "./fieldCatalogReaders.js";
import { parsePhoto } from "./repairVisitWriteContract.js";

/** Bounded in-memory preflight; no dependency on inspection ownership or open-job predicates. */
export async function repairVisitMultipart(request: Request) {
  const invalid=()=>new RepairError("INVALID_REPAIR_REQUEST","Exactly one JPEG and one metadata object are required.",400);
  // express.json may already have consumed a non-multipart request. Reject it
  // before installing stream listeners: an ended stream will never emit end again.
  if (!request.is("multipart/form-data") || request.readableEnded || request.aborted || request.destroyed) throw invalid();
  const chunks: Buffer[]=[];let size=0;
  const limit=attachmentMaxBytes+16*1024;
  await new Promise<void>((resolve,reject)=>{
    request.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size<=limit) chunks.push(Buffer.from(chunk));});
    request.on("end",resolve);request.on("error",reject);
    request.on("aborted",()=>reject(new RepairError("INVALID_REPAIR_REQUEST","Upload interrupted.",400)));
  });
  if(size>limit) throw invalid();
  let metadata: string | undefined,file: Buffer | undefined,bad=false;
  try {
    await new Promise<void>((resolve,reject)=>{
      const parser=Busboy({headers:request.headers,limits:{fields:1,files:1,parts:3,fileSize:attachmentMaxBytes,fieldSize:8192,fieldNameSize:100,headerPairs:50}});
      parser.on("field",(name,value,info)=>{if(name!=="metadata" || metadata!==undefined || info.nameTruncated || info.valueTruncated) bad=true;metadata=value;});
      parser.on("file",(name,stream,info)=>{
        const bytes:Buffer[]=[];if(name!=="file" || info.mimeType!=="image/jpeg" || file!==undefined) bad=true;
        stream.on("limit",()=>{bad=true;});stream.on("data",(b:Buffer)=>bytes.push(b));stream.on("end",()=>{file=Buffer.concat(bytes);});
      });
      for(const event of ["fieldsLimit","filesLimit","partsLimit"]) parser.on(event,()=>{bad=true;});
      parser.on("error",reject);parser.on("close",resolve);parser.end(Buffer.concat(chunks));
    });
    if(bad || !metadata || !file?.length) throw invalid();
    const input=parsePhoto(JSON.parse(metadata));
    const sourcePath=await createAttachmentTempPath();
    try {await writeFile(sourcePath,file,{flag:"wx"});} catch(e) {await unlink(sourcePath).catch(()=>undefined);throw e;}
    return {input,sourcePath};
  } catch(e) {if(e instanceof RepairError) throw e;throw invalid();}
}
