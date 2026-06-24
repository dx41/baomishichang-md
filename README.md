# baomishichang-md
# 保密教育刷学时 - 操作流程

> 前提：页面在 `index=2` 课程详情页（URL 含 `bmCourseDetail/course?index=2`）。

---

## 操作步骤

### 1️⃣ 切换到课程标签页

```js
// 如在 index=1，切到 index=2
window.location.href = window.location.href.replace('index=1', 'index=2');
```

### 2️⃣ 复制执行以下脚本

```js
(function(){
  // 找到 Vue 组件
  function findVM(){
    function walk(o,d){
      if(d>6||!o||typeof o!=='object')return null;
      try{if(typeof o.postStudyRecord==='function'&&o.courseList)return o;}catch(e){}
      if(o.$children)for(var i=0;i<o.$children.length;i++){
        var r=walk(o.$children[i],d+1);if(r)return r;
      }
      return null;
    }
    return walk(document.querySelector('#app').__vue__,0);
  }

  var vm = findVM();
  if(!vm){console.error('未找到 Vue 组件');return;}

  function toSec(t){
    if(!t)return 0;
    var p = t.split(':');
    return parseInt(p[0])*3600 + parseInt(p[1])*60 + (parseInt(p[2])||0);
  }

  function postTab(tabIdx, cb){
    vm.handleChangeTab(tabIdx);
    setTimeout(function(){
      Array.from(document.querySelectorAll('.course-item-box .title.themeBorderColor')).forEach(function(e){e.click()});
    }, 8000);
    setTimeout(function(){
      var total = 0;
      var cl = vm.courseList;
      for(var i=0;i<cl.children.length;i++){
        var ci = cl.children[i];
        if(!ci.children) continue;
        for(var j=0;j<ci.children.length;j++){
          var cj = ci.children[j];
          if(!cj.list) continue;
          for(var k=0;k<cj.list.length;k++){
            var v = cj.list[k];
            if(v.resourceType===1){
              var sec = toSec(v.timeLength);
              v.studyLength = sec;
              v.studyTime = sec + 120;
              vm.postStudyRecord(v, function(){});
              total++;
              console.log('['+total+'] '+v.title);
            }
          }
        }
      }
      console.log('Tab '+tabIdx+' done, total='+total);
      if(cb) cb();
    }, 20000);
  }

  postTab(0, function(){
    postTab(1, function(){
      postTab(2, function(){
        console.log('全部完成');
      });
    });
  });
})();
```

### 3️⃣ 刷新页面

脚本执行完后，刷新页面查看学时是否更新。如需确认上报结果，可在控制台执行：

```js
var vm = (function(){function w(o,d){if(d>6||!o||typeof o!=='object')return null;try{if(typeof o.postStudyRecord==='function'&&o.courseList)return o;}catch(e){}if(o.$children)for(var i=0;i<o.$children.length;i++){var r=w(o.$children[i],d+1);if(r)return r;}return null;}return w(document.querySelector('#app').__vue__,0);})();
vm.getStudyStatus();
```
