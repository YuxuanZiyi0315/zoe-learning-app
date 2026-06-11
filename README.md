# 英语学习助手

面向小学生的英语学习平台，教师可以创建班级、用 AI 自动生成题目并布置作业，学生在线答题后 AI 自动批改并给出鼓励性反馈。

## 功能

- **教师端**：创建班级、管理学生、AI 生成题目（支持文字/图片输入）、布置作业、查看提交
- **学生端**：加入班级、在线答题、查看批改结果和历史记录
- **AI 批改**：接入 MiMo 大模型，自动批改并给出温暖鼓励的评语

## 技术栈

- 后端：Python Flask + SQLite
- 前端：原生 HTML/CSS/JavaScript（移动优先）
- AI：MiMo API（小米大模型）

## 本地运行

```bash
# 安装依赖
pip install -r requirements.txt

# 设置环境变量（或创建 .env 文件）
export MIMO_API_KEY=your_api_key_here

# 启动服务
python server.py
```

访问 http://localhost:18890

## 部署到 Render

1. 将代码推送到 GitHub 仓库
2. 在 Render 创建 Web Service，连接该仓库
3. 设置环境变量 `MIMO_API_KEY`
4. Render 会自动识别 `Procfile` 并部署

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `MIMO_API_KEY` | 是 | MiMo API 密钥 |
| `MIMO_API_URL` | 否 | MiMo API 地址（默认小米官方） |
| `DB_PATH` | 否 | 数据库路径（默认 `data.db`） |
| `PORT` | 否 | 服务端口（Render 自动设置） |
| `FLASK_DEBUG` | 否 | 调试模式（生产环境勿开） |

## 默认账号

- 教师编号：`T001`（张老师）
- 班级编号：`C001`（三年一班）
- 学生首次使用姓名+班级编号自动注册

## 项目结构

```
├── server.py           # 一体化服务器（API + 静态文件）
├── frontend/
│   ├── index.html      # 页面结构
│   ├── styles.css      # 样式
│   └── app.js          # 前端逻辑
├── requirements.txt    # Python 依赖
├── Procfile            # Render 部署配置
├── .env.example        # 环境变量示例
└── .gitignore          # Git 忽略规则
```