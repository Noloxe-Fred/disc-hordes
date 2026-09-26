// Point d'entree du serveur NorthHost : la commande de demarrage Pterodactyl lance `node index.js`
// apres le git pull et le npm install. On prepare la base et on compile avant de lancer le bot.
const { execSync } = require("node:child_process");

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx prisma db seed"); // idempotent (upserts) : resynchronise objets et recettes
run("npx tsc -p tsconfig.json");

require("./dist/index.js");
