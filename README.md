# Mantur Canvas

[中文文档](./README.zh-CN.md)

Official website: [https://mantur.ai](https://mantur.ai)

Mantur Canvas is a local creative canvas for script storyboards, asset management, and AI generation workflows. It helps creators turn scripts into structured episodes, storyboard items, reusable assets, generated images, generated videos, and timeline-ready media.

## What It Does

Mantur Canvas is designed for local-first creative production:

- Manage script-based creative projects
- Organize episodes, storyboards, assets, images, and videos
- Use a visual React Flow canvas to plan and execute generation workflows
- Configure local agents and model providers for image/video generation
- Keep generated project data on your own machine
- Run as a local development or production Next.js app

## Product Modules

- **Projects**: create and switch between local creative projects.
- **Episodes**: manage story segments and their storyboard materials.
- **Canvas**: arrange workflow nodes and persist canvas state per project.
- **Assets**: manage characters, scenes, props, voices, videos, and references.
- **AI Chat / Agents**: run configured agents against the current project context.
- **Settings**: configure image models, video models, image hosting, and agents.
- **Video Footer**: preview and assemble generated video segments.

## Tech Stack

- Next.js App Router
- React 19
- React Flow
- Tailwind CSS
- ShadCN/UI
- next-intl
- Zustand

## Requirements

- Node.js 20 or later
- npm
- Local video merge uses the bundled `ffmpeg-static` and `ffprobe-static` packages.

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/mantur-ai/canvas.git
cd canvas
npm install
```

Copy the example database configuration and skills into the project root:

```bash
mkdir -p db skills
cp -R example/db/. db/
cp -R example/skills/. skills/
```

## Beginner Quick Start

Use the OS quick-start script. It can install Node.js first when Node.js is not available.

Windows:

```bat
scripts\quick-start.cmd
```

macOS or Linux:

```bash
bash scripts/quick-start.sh
```

The quick-start script checks the Node.js version, installs dependencies, prepares local example files, and starts the development server.

## Start In Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production Build

```bash
npm run build
npm run start
```

## Run With PM2

Install PM2 once on the server:

```bash
npm install -g pm2
```

Build the app before starting it with PM2:

```bash
npm install
npm run build
npm run pm2:start
```

The PM2 config uses `ecosystem.config.cjs` and starts the production app on `0.0.0.0:3000`.

Common PM2 commands:

```bash
npm run pm2:reload
npm run pm2:stop
pm2 logs mantur-canvas
pm2 save
```

## First-Time Setup

After opening the app:

1. Create or select a project.
2. Open settings and add the required model/provider configuration.
3. Configure an agent command if you want to use agent-driven workflows.
4. Add or import script/project materials.
5. Use the canvas, assets panel, and episode panel to manage generation work.

Configuration and generated data stay local unless you explicitly upload or share them through configured providers.

## Local Data

Runtime data is intentionally kept local:

- `projects/`: generated projects, canvas data, assets, images, videos, and manifests
- `db/config.json`: local model and provider configuration
- `db/agent.json`: local agent configuration

These paths may contain private user data, API configuration, prompts, generated media, and provider outputs. Review them before publishing, backing up, or sharing a workspace.

## Scripts

- `npm run dev`: start the development server
- `npm run quick-start`: check the environment, install dependencies, and start the development server when Node.js is already installed
- `npm run build`: build the production app
- `npm run start`: start the production server
- `npm run pm2:start`: start the production server with PM2
- `npm run pm2:reload`: reload the PM2 process after a new build or environment change
- `npm run pm2:stop`: stop the PM2 process
- `npm run lint`: run Oxlint
- `npm run format`: format files with Oxfmt
- `npm run format:check`: check formatting

## Development Notes

- UI text should live in locale files under `messages/`.
- Project file reads and writes should go through service modules.
- Canvas data should stay serializable.
- Avoid committing generated project data or private configuration.

## Contributing

Issues and pull requests are welcome. Please describe the product behavior you are changing, keep documentation updated, and run lint/build checks before opening a pull request.

## License

This project is licensed under the [MIT License](./LICENSE).
