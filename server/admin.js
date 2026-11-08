/* Admin commands, run from the project folder:
     npm run admin -- list
     npm run admin -- badges lock verified,crown      (set badges; "none" clears)
     npm run admin -- delete someuser
   Badge icons: verified, crown, code, star, bolt, fire, heart
*/
const path = require("path");
const fs = require("fs");
const { db } = require("./db");
const { BADGE_ICONS } = require("./profile");

const LABELS = { verified: "Verified", crown: "Owner", code: "Developer", star: "Early Supporter", bolt: "Booster", fire: "Popular", heart: "Friend" };
const [cmd, name, arg] = process.argv.slice(2);
const user = name && db.prepare("SELECT * FROM users WHERE username = ?").get(name.toLowerCase());

switch (cmd) {
  case "list":
    for (const u of db.prepare("SELECT id, username, email, views, badges, created_at FROM users ORDER BY id").all())
      console.log(`#${u.id}  ${u.username.padEnd(20)} ${u.email.padEnd(30)} views:${u.views}  badges:${u.badges}`);
    break;

  case "badges": {
    if (!user) { console.log("User not found"); break; }
    const icons = !arg || arg === "none" ? [] : arg.split(",").map(s => s.trim()).filter(i => BADGE_ICONS.includes(i));
    const badges = icons.map(icon => ({ icon, label: LABELS[icon] }));
    db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(badges), user.id);
    console.log(`${user.username} badges:`, icons.join(", ") || "(none)");
    break;
  }

  case "delete": {
    if (!user) { console.log("User not found"); break; }
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    const dir = path.join(process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads"), String(user.id));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deleted ${user.username}`);
    break;
  }

  default:
    console.log("Commands: list | badges <username> <icon,icon|none> | delete <username>");
}
