import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// ele按需引入
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    //压缩
    minify: false,
  },
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  server: {
    // 启用热更新
    hmr: true,
  },
});
