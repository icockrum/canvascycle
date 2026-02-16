import fs from "fs";
import path from "path";

const [, , jsonPathArg, outputPathArg] = process.argv;

if (!jsonPathArg) {
  console.error(
    "Usage: node node/json-to-embed-player.js <input.json> [output.js]",
  );
  process.exit(1);
}

const inputPath = path.resolve(jsonPathArg);
if (!fs.existsSync(inputPath)) {
  console.error(`JSON file not found: ${inputPath}`);
  process.exit(1);
}

const outputPath = path.resolve(
  outputPathArg || `${path.basename(inputPath, path.extname(inputPath))}.js`,
);

let json;
try {
  json = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (err) {
  console.error(`Failed to parse JSON: ${err.message}`);
  process.exit(1);
}

const runtime =
  "function m(v,n,x){var z=Number(v);return Number.isNaN(z)?n:Math.max(n,Math.min(x,z))}function n(i){return{filename:i.filename||'untitled.json',width:i.width,height:i.height,pixels:i.pixels instanceof Uint8Array?i.pixels:Uint8Array.from(i.pixels||[]),colors:(i.colors||[]).map(function(c){return[c[0],c[1],c[2]]}),cycles:(i.cycles||[]).map(function(c){return{low:m(c.low,0,255),high:m(c.high,0,255),rate:Number(c.rate)||0,reverse:m(c.reverse,0,2)}})}}function g(b,y,t){var o=b.map(function(c){return[c[0],c[1],c[2]]});for(var i=0;i<y.length;i++){var c=y[i];if(!c||!c.rate)continue;var l=Math.max(0,c.low|0),h=Math.min(255,c.high|0);if(h<=l)continue;var s=h-l+1,a=Math.floor((t/(1000/(c.rate/280)))%s),r=c.reverse===2?(s-a)%s:a;if(!r)continue;var q=o.slice(l,h+1);for(var j=0;j<s;j++)o[l+((j+r)%s)]=q[j]}return o}function P(cv){this.canvas=cv;this.ctx=cv.getContext('2d');this.imageData=null;this.data=null;this.paused=false;this.raf=0;this.lastDraw=0;this.targetFps=60;this.loop=this.loop.bind(this)}P.prototype.loadFromData=function(d){this.data=n(d);this.canvas.width=this.data.width;this.canvas.height=this.data.height;this.imageData=this.ctx.createImageData(this.data.width,this.data.height);this.lastDraw=performance.now();if(!this.raf)this.raf=requestAnimationFrame(this.loop)};P.prototype.loop=function(now){if(this.data&&!this.paused){var min=1000/this.targetFps;if(now-this.lastDraw>=min){this.render(now);this.lastDraw=now}}this.raf=requestAnimationFrame(this.loop)};P.prototype.render=function(now){var colors=g(this.data.colors,this.data.cycles,now),src=this.data.pixels,dst=this.imageData.data;for(var i=0;i<src.length;i++){var c=colors[src[i]]||[0,0,0],di=i*4;dst[di]=c[0];dst[di+1]=c[1];dst[di+2]=c[2];dst[di+3]=255}this.ctx.putImageData(this.imageData,0,0)};";

const script = `(function(){"use strict";${runtime}var data=${JSON.stringify(json)};var script=document.currentScript;var canvas=document.createElement("canvas");canvas.width=data.width;canvas.height=data.height;canvas.style.display="inline-block";canvas.style.imageRendering="pixelated";canvas.setAttribute("aria-label",(data.filename||"CanvasCycle animation")+" animation");if(script&&script.parentNode){script.parentNode.insertBefore(canvas,script);script.parentNode.removeChild(script)}else{document.body.appendChild(canvas)}new P(canvas).loadFromData(data)})();`;

fs.writeFileSync(outputPath, script, "utf8");
console.log(`Wrote ${outputPath}`);
