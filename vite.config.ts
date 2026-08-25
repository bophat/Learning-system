import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build ra một file index.html duy nhất (JS/CSS nhúng thẳng vào) — dự án nhỏ,
// dữ liệu câu hỏi đã là một khối JSON lớn nhúng sẵn nên tách chunk không lợi
// gì nhiều; một file HTML tự chứa còn tiện để xem trực tiếp hoặc host ở bất
// kỳ đâu mà không cần cấu hình đường dẫn tài nguyên.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "es2020",
  },
});
