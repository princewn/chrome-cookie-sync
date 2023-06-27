<template>
  <div>
    <div v-show="domainList.length" class="config-table">
      <el-table :data="domainList" stripe style="width: 100%">
        <el-table-column prop="from" label="from" width="180" />
        <el-table-column prop="name" label="name" width="180" />
        <el-table-column prop="to" label="to" />
        <el-table-column prop="gap" label="轮询间隔（秒）"></el-table-column>
        <el-table-column label="操作"  width="180">
          <template #default="{ row }">
            <a class="btn" @click="deleteList(row)">
              删除
            </a>
            <a class="btn" v-show="row.inInterval === false" @click="startButtonClicked(row)">
              开启轮询
            </a>
            <a class="btn" v-show="row.inInterval === true" @click="stopButtonClicked(row)">
              关闭轮询
            </a>
            <a class="btn" v-show="row.inUse === false" @click="updateList(row)">
              启用
            </a>
            <a class="btn" v-show="row.inUse === true" @click="updateList(row)">
              禁用
            </a>
          </template>
        </el-table-column>
      </el-table>
      <el-divider></el-divider>
    </div>
    <el-form
      ref="formRef"
      :inline="true"
      label-suffix=":"
      :model="nextConfigItem"
      :rules="formRules"
    >
      <el-form-item label="把" prop="from">
        <el-autocomplete
          v-model="nextConfigItem.from"
          :fetch-suggestions="querySearch"
          placeholder="输入目标站点"
          @select="handleSelect(formRef)"
        />
      </el-form-item>
      <el-form-item label="的cookie" prop="name">
        <el-input v-model="nextConfigItem.name"></el-input>
      </el-form-item>
      <el-form-item label="同步到" prop="to">
        <el-input v-model="nextConfigItem.to"></el-input>
      </el-form-item>
      <el-form-item label="检测到目标cookie变化或者刷新源网站的秒数" prop="gap">
        <el-input v-model="nextConfigItem.gap"></el-input>
      </el-form-item>
    </el-form>
    <div class="submit-content">
      <el-button @click="onSubmit(formRef)">添加监控</el-button>
    </div>
    <el-alert
      v-if="alertText"
      :title="alertText"
      type="warning"
      show-icon
      :closable="false"
    ></el-alert>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";

const initItem = {
  from: "",
  name: "",
  to: "http://localhost",
  gap: 60,
  inInterval: false,
};
const nextConfigItem = reactive(initItem);
const formRef = ref();
const formRules = reactive({
  from: [{ required: true, message: "请输入源站点", trigger: "blur" }],
  to: [{ required: true, message: "请输入目标站点", trigger: "blur" }],
  name: [{ required: true, message: "请输入cookie名称", trigger: "blur" }],
  gap: [{ required: true, message: "请输入源网站刷新间隔", trigger: "blur" }],
});
let domainList = reactive([]);
let alertText = ref(null);

onMounted(async () => {
  const { domainList: domainObj } = await chrome.storage.local.get(["domainList"]);
  if ( domainObj ) {
    domainList.push(... Object.values(domainObj))   
  }
});

async function onSubmit(formEl) {
  if (!formEl) return;
  formEl.validate(async valid => {
    if (valid) {
      const str = nextConfigItem['from'] + '-' + nextConfigItem['name'] + '-' + nextConfigItem['to'];
      alertText.value = null;
      if (domainList.some(e => e.id === str)) {
        alertText.value = "此配置项已存在于监控列表中，无需重复添加哦";
        return;
      }
      const config = {
        ...nextConfigItem,
        id: str,
        inUse: true,
        inInterval: false
      };
      const result = await updateCookie(config);
      // 如果不存在该cookie显示提示信息；存在再执行后续逻辑
      if (!result) {
        alertText.value = `源站点不存在cookie(${config.name}),但仍为你加入到了监控列表`;
      }
      domainList.push(config);
      await updateStorage(domainList);
      const list = await chrome.storage.local.get(["domainList"]);
      console.log("onSubmit", list);
    }
  });
}

async function deleteList(row) {
  alertText.value = null;
  const index = domainList.findIndex(e => e.id === row.id);
  domainList.splice(index, 1);
  await updateStorage(domainList);
}

async function updateList(row) {
  alertText.value = null;
  const index = domainList.findIndex(e => e.id === row.id);
  domainList[index].inUse = !domainList[index].inUse;
  await updateStorage(domainList);
}

function startButtonClicked(row) {
  const seconds = row.gap
  const currentURL = row.from
  if (seconds != null && seconds > 0 && currentURL) {
    chrome.tabs.create(
        {
          url: currentURL,
          active: false
        },
        (response) => {
          row.tab = response
          chrome.runtime.sendMessage(
            {
              message: "add_url",
              payload: {
                url: currentURL,
                tab: response,
                time: seconds,
              },
            },
            (response) => {
              if (response.message === "success") {
                console.log("sucessfully logged");
                row.inInterval = true
              } else {
                console.log("unsucessfully logged");
              }
            }
          );
        }
      );
  }
}

function stopButtonClicked(row) {
  const seconds = parseInt(row.gap);
  const currentURL = row.from 
  const currentTab = row.tab 
  chrome.runtime.sendMessage(
    {
      message: "stop_single_process",
      payload: {
        url: row.from,
        tab: currentTab
      },
    },
    (response) => {
      if (response && response.message === "success") {
        console.log("sucessfully removed");
        row.inInterval = false
      } else {
        console.log("unsucessfully removed");
      }
    }
  );
}

async function updateStorage(list) {
  await chrome.storage.local.set({ domainList: list });
  const data = await chrome.storage.local.get(["domainList"]);
  console.log("updateStorage", data);
}

async function updateCookie(config) {
  const cookie = await chrome.cookies.get({
    url: addProtocol(config.from),
    name: config.name,
  });
  return cookie ? await setCookie(cookie, config) : null;
}

const restaurants = reactive([
  {
    value: "https://huntermanualauditweb.58corp.com/",
  }
]);

const querySearch = (queryString, cb) => {
  const results = queryString ? restaurants.filter(e => e.value === queryString) : restaurants;
  cb(results);
};

function handleSelect(formEl) {
  formEl.clearValidate("from");
}

// 增加协议头
function addProtocol(uri) {
  return uri.startsWith("http") || uri.startsWith("https") ? uri : "http://" + uri;
}
// 去除协议头
function removeProtocol(uri) {
  return uri.startsWith("http") || uri.startsWith("https")  ? uri.replace("https://", "").replace("http://", "") : uri;
}

function setCookie(cookie, config) {
  if(config.to.indexOf('localhost') > -1 || config.to.indexOf('127.0.0.1') > -1 || config.to.indexOf('127.0.0.1') > -1) {
    chrome.cookies.set({
      url: addProtocol(config.to),
      domain: "",
      name: cookie["name"],
      path: cookie["path"],
      value: cookie["value"],
    });
    return
  }
  chrome.cookies.set({
    url: addProtocol(config.to),
    domain: removeProtocol(config.to),
    name: cookie["name"],
    path: cookie["path"],
    value: cookie["value"],
  });
}
</script>

<style lang="less" scoped>
.submit-content {
  text-align: center;
  padding-bottom: 12px;
}
.import-content {
  margin: 12px 0;
}
.config-table .btn {
  color: rgb(26, 115, 232);
  cursor: pointer;
}
</style>
