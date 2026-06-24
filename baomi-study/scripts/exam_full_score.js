#!/usr/bin/env node
/**
 * baomi-study / exam_full_score.js
 *
 * 双模式：
 *   --mode read      读取当前页面的题目和选项，输出结构化 JSON
 *   --mode answer    接收答案数组，点击提交
 *
 * 用法:
 *   读题: node exam_full_score.js --mode read
 *   答题: node exam_full_score.js --mode answer --answers=[0,2,2,3,1,0,0,0,1,0,0,0,1,0,3,1,1,1,0,0]
 */

const H = require("http");
const WS = require("ws");
const sl = ms => new Promise(r => setTimeout(r, ms));

const CDP_PORT = parseInt(process.argv.find(a => a.startsWith("--cdp-port="))?.split("=")[1] || process.env.CDP_PORT || "18802", 10);
const MODE = process.argv.find(a => a.startsWith("--mode="))?.split("=")[1] || "read";

let answers;
try {
  const ansArg = process.argv.find(a => a.startsWith("--answers="));
  if (ansArg) answers = JSON.parse(ansArg.split("=")[1]);
} catch (e) { console.error("答案格式错误"); process.exit(1); }

async function connectCDP() {
  const pages = await getCDPPages();
  let page = pages.find(p => p.type === "page" && p.url?.includes("baomi") && (p.url?.includes("Exam") || p.url?.includes("exam")));
  if (!page) page = pages.find(p => p.type === "page" && p.url?.includes("baomi"));
  if (!page) { console.error("无 baomi 页面"); process.exit(1); }

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
  return { ws, js };
}

async function modeRead() {
  const { ws, js } = await connectCDP();

  // 读取题目（含题号）和选项
  const data = await js(`
    (function(){
      var groups = document.querySelectorAll('.el-radio-group');
      var questions = [];

      // 获取页面中所有文本节点，分离题目和选项
      var allText = document.body.innerText;
      var lines = allText.split('\\n').filter(function(l){return l.trim().length>0});

      // 逐行解析：题号行是"数字." 开头，选项行是"A." "B." 开头
      var currentQ = null;
      for(var i=0;i<lines.length;i++){
        var l = lines[i].trim();
        var numMatch = l.match(/^(\\d+)\\.\\s*(.+)/);
        if(numMatch){
          if(currentQ) questions.push(currentQ);
          currentQ = { idx: parseInt(numMatch[1]), text: numMatch[2].trim(), options: [] };
        } else {
          var optMatch = l.match(/^([A-D])\\.\\s*(.+)/);
          if(optMatch && currentQ){
            currentQ.options.push({ label: optMatch[1], text: optMatch[2].trim() });
          } else if(currentQ && currentQ.options.length===0 && l.length<200) {
            // 可能是上一行末尾换行导致的题目文本续行
            currentQ.text += ' ' + l;
          }
        }
      }
      if(currentQ) questions.push(currentQ);

      // 判断题型：单选还是判断
      for(var j=0;j<questions.length;j++){
        var q = questions[j];
        q.type = q.options.length <= 2 ? 'judge' : 'single';
        // 读取选项的实际文字（from DOM labels 更可靠）
        if(j < groups.length) {
          var labels = groups[j].querySelectorAll('.el-radio__label');
          q.domOptions = [];
          for(var k=0;k<labels.length;k++) q.domOptions.push(labels[k].textContent.trim());
        }
      }
      return JSON.stringify(questions);
    })()
  `);

  if (!data || data === "[]") {
    console.error("未读取到题目，可能不在考试页面");
    process.exit(1);
  }

  // 输出结构化 JSON
  console.log(JSON.stringify(JSON.parse(data), null, 2));
  ws.close();
}

async function modeAnswer() {
  if (!answers || answers.length < 15) {
    console.error("请提供答案数组，如 --answers=[0,2,2,3,1,0,0,0,1,0,0,0,1,0,3,1,1,1,0,0]");
    process.exit(1);
  }
  console.error("答案: [" + answers.join(",") + "]");

  const { ws, js } = await connectCDP();

  const clicked = await js(`
    (function(){
      var groups = document.querySelectorAll('.el-radio-group');
      var ans = ${JSON.stringify(answers)};
      var clicked = 0;
      for(var i = 0; i < groups.length && i < ans.length; i++) {
        var radios = groups[i].querySelectorAll('.el-radio');
        var idx = ans[i];
        if(radios[idx]) {
          var label = radios[idx].querySelector('.el-radio__label');
          if(label) label.click();
          else radios[idx].click();
          clicked++;
        }
      }
      return clicked;
    })()
  `);
  console.error(`已点击 ${clicked}/${answers.length} 个选项`);

  await sl(2000);

  const submitResult = await js(`
    (function(){
      function walk(o,d){if(d>8||!o||typeof o!=='object')return null;try{if(typeof o.saveExamResult==='function')return o;}catch(e){}if(o.$children)for(var i=0;i<o.$children.length;i++){var r=walk(o.$children[i],d+1);if(r)return r;}return null;}
      var vm = walk(document.querySelector('#app').__vue__,0);
      if(!vm) return 'no vm';
      vm.saveExamResult();
      return 'submitted';
    })()
  `);
  console.error("提交: " + submitResult);

  await sl(5000);

  const resultBody = await js("document.body.innerText.replace(/\\s+/g,' ')");
  const scoreMatch = resultBody.match(/考试成绩\s*(\d+)/);
  const score = scoreMatch ? scoreMatch[1] : "未知";
  console.error("考试成绩: " + score + "/100");
  console.log(JSON.stringify({ score: parseInt(score || "0"), passed: parseInt(score || "0") >= 90 }));

  ws.close();
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

if (MODE === "read") modeRead().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
else if (MODE === "answer") modeAnswer().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
else { console.error("未知模式: " + MODE); process.exit(1); }
