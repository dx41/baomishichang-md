#!/usr/bin/env node
/**
 * baomi-study / study_brush.js
 *
 * 通过 CDP 连接到 Chrome，在 baomi.org.cn 课程页自动刷学时。
 *
 * 用法: node scripts/study_brush.js [--cdp-port 18802]
 *
 * 前置条件：
 *   - Chrome 已用 --remote-debugging-port=<cdp-port> 启动
 *   - 浏览器已登录 baomi.org.cn
 *   - 至少有一个标签页在 baomi 课程页 (URL 含 bmCourseDetail/course?index=2)
 */

const H = require("http");
const WS = require("ws");
const sl = ms => new Promise(r => setTimeout(r, ms));

// === 配置 ===
const CDP_PORT = parseInt(process.argv.find(a => a.startsWith("--cdp-port="))?.split("=")[1] || process.env.CDP_PORT || "18802", 10);
const COURSE_ID = "312bc914-8e11-421b-b9bc-e900fe1a4e50";
const SITE_ID = "95";
const COURSE_URL = `https://www.baomi.org.cn/bmCourseDetail/course?index=2&id=${COURSE_ID}&siteId=${SITE_ID}`;

async function main() {
  // 1. 连接 CDP
  const pages = await getCDPPages();
  let page = pages.find(p => p.type === "page" && p.url?.includes("baomi") && p.url?.includes("course"));
  if (!page) {
    console.log("未找到课程页，尝试导航...");
    page = pages.find(p => p.type === "page" && p.url?.includes("baomi"));
    if (!page) { console.error("无 baomi 页面"); process.exit(1); }
  }
  console.log("连接到: " + (page.title || "").substring(0, 60));

  const ws = new WS(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));
  ws.on("message", () => {});
  let msgId = 0;
  const cdp = (method, params) => new Promise(r => {
    const id = ++msgId;
    const handler = data => { try { const resp = JSON.parse(data.toString()); if (resp.id === id) { ws.removeListener("message", handler); r(resp); } } catch (e) {} };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async expr => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, timeout: 20000 }); return r.result?.result?.value; };
  await cdp("Page.enable");

  // 2. 确保在课程页 (index=2)
  let url = await js("window.location.href");
  if (!url?.includes("index=2")) {
    console.log("导航到课程页...");
    await cdp("Page.navigate", { url: COURSE_URL });
    await sl(15000);
  }

  // 3. 检查 Vue 组件
  const vmCheck = await js(`
    (function(){
      function walk(o,d){if(d>6||!o||typeof o!=='object')return null;try{if(typeof o.postStudyRecord==='function'&&o.courseList)return o;}catch(e){}if(o.$children)for(var i=0;i<o.$children.length;i++){var r=walk(o.$children[i],d+1);if(r)return r;}return null;}
      return walk(document.querySelector('#app').__vue__,0) ? 'ok' : 'not found';
    })()
  `);
  if (vmCheck !== "ok") { console.error("未找到 Vue 组件，请确保在课程页"); ws.close(); process.exit(1); }

  // 4. 获取当前学时
  let body = await js("document.body.innerText.replace(/\\s+/g,' ')");
  let m = body.match(/([\d.]+)\s*学时/);
  console.log("当前学时: " + (m ? m[1] : "未知"));

  // 5. 执行刷学时
  console.log("开始刷学时...");
  const result = await js(`
    (function(){
      function walk(o,d){if(d>6||!o||typeof o!=='object')return null;try{if(typeof o.postStudyRecord==='function'&&o.courseList)return o;}catch(e){}if(o.$children)for(var i=0;i<o.$children.length;i++){var r=walk(o.$children[i],d+1);if(r)return r;}return null;}
      var vm = walk(document.querySelector('#app').__vue__,0);
      if(!vm) return 'no vm';
      function toSec(t){if(!t)return 0;var p=t.split(':');return parseInt(p[0])*3600+parseInt(p[1])*60+(parseInt(p[2])||0);}
      var total = 0;
      function postTab(tabIdx, cb){
        vm.handleChangeTab(tabIdx);
        setTimeout(function(){
          document.querySelectorAll('.course-item-box .title.themeBorderColor').forEach(function(e){e.click()});
        }, 8000);
        setTimeout(function(){
          var cl = vm.courseList;
          if(!cl || !cl.children) { cb(); return; }
          for(var i=0;i<cl.children.length;i++){
            var ci=cl.children[i]; if(!ci.children) continue;
            for(var j=0;j<ci.children.length;j++){
              var cj=ci.children[j]; if(!cj||!cj.list) continue;
              for(var k=0;k<cj.list.length;k++){
                var v=cj.list[k];
                if(v.resourceType===1){
                  var sec=toSec(v.timeLength); v.studyLength=sec; v.studyTime=sec+120;
                  vm.postStudyRecord(v,function(){}); total++;
                }
              }
            }
          }
          console.log('Tab '+tabIdx+': posted '+total);
          if(cb) cb();
        }, 20000);
      }
      postTab(0, function(){ postTab(1, function(){ postTab(2, function(){ console.log('COMPLETE total='+total); }); }); });
      return 'brushing started';
    })()
  `);
  console.log("Run: " + result);

  // 6. 等待执行完毕
  await sl(75000);

  // 7. 刷新查看结果
  await js("window.location.reload()");
  await sl(15000);

  body = await js("document.body.innerText.replace(/\\s+/g,' ')");
  m = body.match(/([\d.]+)\s*学时/);
  console.log("刷后学时: " + (m ? m[1] : "未知"));
  console.log("刷学时完成！");

  ws.close();
  process.exit(0);
}

function getCDPPages() {
  return new Promise((resolve, reject) => {
    H.get(`http://127.0.0.1:${CDP_PORT}/json`, resp => {
      let buf = "";
      resp.on("data", c => buf += c);
      resp.on("error", reject);
      resp.on("end", () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
