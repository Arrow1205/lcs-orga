import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

// Venue maps can have page dimensions over 20,000 points. Render at the
// available screen width, rather than allocating a canvas at PDF size.
export async function renderPlanPdf(blob,canvas,availableWidth,zoom=1){
 const data=new Uint8Array(await blob.arrayBuffer());
 const documentTask=pdfjs.getDocument({data});
 try{
  const pdf=await documentTask.promise;
  const page=await pdf.getPage(1);
  const base=page.getViewport({scale:1});
  const width=Math.min(4096,Math.max(280,availableWidth)*zoom);
  const viewport=page.getViewport({scale:width/base.width});
  const pixelRatio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(viewport.width,viewport.height));
  canvas.width=Math.round(viewport.width*pixelRatio);
  canvas.height=Math.round(viewport.height*pixelRatio);
  canvas.style.width=viewport.width+'px';
  canvas.style.height=viewport.height+'px';
  const context=canvas.getContext('2d');
  await page.render({canvasContext:context,viewport,transform:[pixelRatio,0,0,pixelRatio,0,0]}).promise;
 }finally{await documentTask.destroy();}
}
