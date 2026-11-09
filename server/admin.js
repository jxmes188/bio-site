/* Command-line admin tools, run from the project folder.
   (Most of this is easier from the admin page at /admin.)
     npm run admin -- list
     npm run admin -- badges lock "Owner,Staff"     (badge names from the admin page; "none" clears)
     npm run admin -- delete someuser
*/
const path = require("path");
const fs = require("fs");
const { db } = require("./db");

const [cmd, name, arg] = process.argv.slice(2);
const user = name && db.prepare("SELECT * FROM users WHERE username = ?").get(name.toLowerCase());

switch (cmd) {
  case "list":
    for (const u of db.prepare("SELECT id, username, email, views, badges, banned FROM users ORDER BY id").all())
      console.log(`#${u.id}  ${u.username.padEnd(20)} ${u.email.padEnd(30)} views:${u.views}  badges:${u.badges}${u.banned ? "  BANNED" : ""}`);
    break;

  case "badges": {
    if (!user) { console.log("User not found"); break; }
    const all = db.prepare("SELECT id, name FROM badges").all();
    const wanted = !arg || arg === "none" ? [] : arg.split(",").map(s => s.trim().toLowerCase());
    const ids = all.filter(b => wanted.includes(b.name.toLowerCase())).map(b => b.id);
    db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(ids), user.id);
    console.log(`${user.username} badges:`, all.filter(b => ids.includes(b.id)).map(b => b.name).join(", ") || "(none)");
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
    console.log('Commands: list | badges <username> "<Badge,Badge|none>" | delete <username>');
}
