#!/usr/bin/env node
/**
 * baomi-study / download_cert.js
 *
 * 通过 CDP 获取并下载保密教育线上培训证书。
 *
 * 用法: node scripts/download_cert.js [--cdp-port 18802] [--name 姓名]
 *
 * 前置条件：
 *   - Chrome 已开启 CDP 调试端口
 *   - 已登录 baomi.org.cn
 *   - 学时 ≥ 4.0 且考试成绩 ≥ 90
 */

const H = require("http");
const WS = require("ws");
const sl = ms => new Promise(r => setTimeout(r, ms));

const CDP_PORT = parseInt(process.argv.find(a => a.startsWith("--cdp-port="))?.split("=")[1] || process.env.CDP_PORT || "18802", 10);
const OVERRIDE_NAME = process.argv.find(a => a.startsWith("--name="))?.split("=")[1];

async function main() {
  const pages = await getCDPPages();
  let page = pages.find(p => p.type === "page" && p.url?.includes("baomi"));

  if (!page) { console.error("无 baomi 页面"); process.exit(1); }

  // 如果当前在课程页，切换到证书标签
  if (page.url?.includes("course")) {
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
    const js = async expr => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, timeout: 15000 }); return r.result?.result?.value; };
    await cdp("Page.enable");

    // 点击"证书"标签
    await js("Array.from(document.querySelectorAll('.el-tabs__item')).filter(function(e){return e.textContent.trim()==='证书'}).forEach(function(e){e.click()})");
    await sl(5000);

    // 检查证书内容
    const body = await js("document.body.innerText.replace(/\\s+/g,' ')");
    if (body.includes("保密教育培训证书")) {
      console.log("已在证书页");
    } else {
      console.log("未显示证书，可能需要先完成考试");
      ws.close();
      process.exit(0);
    }

    ws.close();
  }

  // 重新获取页面（可能已导航到 cert 页面）
  await sl(1000);
  const updatedPages = await getCDPPages();
  page = updatedPages.find(p => p.type === "page" && p.url?.includes("baomi"));
  if (!page) { console.error("页面丢失"); process.exit(1); }

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
  const js = async expr => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, timeout: 15000 }); return r.result?.result?.value; };
  await cdp("Page.enable");

  // 读取证书信息
  const body = await js("document.body.innerText.replace(/\\s+/g,' ')");
  const certNoMatch = body.match(/证书号[：:]\s*(\S+)/);
  const nameMatch = body.match(/(\S{2,4})\s*(?:修改姓名|下载证书)/);
  console.log("证书号: " + (certNoMatch ? certNoMatch[1] : "未知"));
  console.log("姓名: " + (nameMatch ? nameMatch[1] : "未知"));

  // 如需修改姓名
  if (OVERRIDE_NAME) {
    await js(`
      (function(){
        // 点击修改姓名
        var btns = Array.from(document.querySelectorAll('button,span'));
        var btn = btns.find(function(b){return b.textContent.trim().includes('修改姓名')});
        if(btn) btn.click();
        return !!btn;
      })()
    `);
    await sl(2000);

    // 填入姓名
    await js(`
      (function(){
        var input = document.querySelector('input[placeholder*="姓名"],input[placeholder*="名字"]');
        if(input) { input.value = '${OVERRIDE_NAME}'; input.dispatchEvent(new Event('input')); return 'inputted'; }
        return 'no input';
      })()
    `);
    await sl(1000);

    // 确认
    await js("Array.from(document.querySelectorAll('button,span')).filter(function(b){return b.textContent.trim().includes('确定')||b.textContent.trim().includes('确认')}).forEach(function(b){b.click()})");
    await sl(3000);
  }

  // 调用 Vue downloadCert 方法
  const dlResult = await js(`
    (function(){
      function walk(o,d){if(d>8||!o||typeof o!=='object')return null;try{if(typeof o.downloadCert==='function')return o;}catch(e){}if(o.$children)for(var i=0;i<o.$children.length;i++){var r=walk(o.$children[i],d+1);if(r)return r;}return null;}
      var vm = walk(document.querySelector('#app').__vue__,0);
      if(!vm) return 'no vm';
      vm.downloadCert();
      return 'downloaded';
    })()
  `);
  console.log("下载: " + dlResult);
  await sl(5000);

  // 检查下载目录
  const { execSync } = require("child_process");
  try {
    const files = execSync("ls -lt " + JSON.stringify(process.env.HOME + "/下载/*.png") + " 2>/dev/null | head -3").toString().trim();
    console.log("证书文件:\n" + files.split("\n").slice(1).map(l => l.trim()).join("\n"));
  } catch (e) {}

  console.log("证书下载完成！");
  ws.close();
  process.exit(0);
}

function getCDPPages() {
  return new Promise((resolve, reject) => {
    H.get(`http://127.0.0.1:${CDP_PORT}/json`, resp => {
      let buf = "";
      resp.on("data", c => buf += c);
      resp.on("error", reject);
      resp.on("end", () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
