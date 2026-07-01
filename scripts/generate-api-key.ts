import { intro, text, select, outro, spinner, isCancel } from "@clack/prompts";
import jwt from "jsonwebtoken";
import { Database } from "bun:sqlite";
import path from "path";

// Initialize SQLite connection directly to the builder.sqlite file
// so we can insert the api key records without booting the whole runtime.
const dbPath = path.join(process.cwd(), "apps/radiant-api/builder.sqlite");
const db = new Database(dbPath);

async function main() {
  intro("✨ Radiant API Key Generator ✨");

  const ownerName = await text({
    message: "What is the owner's name?",
    placeholder: "John Doe",
    validate(value) {
      if (value.length === 0) return "Name is required!";
    }
  });
  if (isCancel(ownerName)) return;

  const companyName = await text({
    message: "What is the company name?",
    placeholder: "Acme Corp",
    validate(value) {
      if (value.length === 0) return "Company name is required!";
    }
  });
  if (isCancel(companyName)) return;

  const expirationInput = await text({
    message: "Expiration time in hours (e.g., 0.5 for 30m, 24 for 1 day, or leave blank for non-expiring):",
    placeholder: "Non-expiring",
  });
  if (isCancel(expirationInput)) return;

  const s = spinner();
  s.start("Generating and signing JWT...");

  const payload = {
    owner: ownerName,
    company: companyName
  };

  const secret = process.env.JWT_SECRET || "radiant-secret-key";
  
  let token: string;
  let expiresAtStr: string = "";

  if (expirationInput && expirationInput.trim() !== "") {
    const hours = parseFloat(expirationInput as string);
    if (isNaN(hours)) {
      s.stop("Failed");
      console.error("Invalid expiration hours provided.");
      return;
    }
    
    const expiresInSeconds = Math.floor(hours * 60 * 60);
    token = jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
    
    const expiresAtDate = new Date(Date.now() + expiresInSeconds * 1000);
    expiresAtStr = expiresAtDate.toISOString();
  } else {
    // Non-expiring token
    token = jwt.sign(payload, secret);
  }

  s.message("Saving to database...");
  
  try {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAtVal = expiresAtStr || null;

    db.run(
      `INSERT INTO apiKeys (id, key, ownerName, companyName, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, token, ownerName as string, companyName as string, expiresAtVal, createdAt, createdAt]
    );
  } catch (err) {
    s.stop("Database error");
    console.error("Failed to insert into DB:", err);
    return;
  }

  s.stop("Key successfully generated!");

  console.log(`\n==========================================`);
  console.log(`OWNER: ${ownerName}`);
  console.log(`COMPANY: ${companyName}`);
  console.log(`EXPIRES: ${expiresAtStr ? expiresAtStr : "Never"}`);
  console.log(`==========================================`);
  console.log(`API KEY (Bearer):`);
  console.log(`\x1b[1;36m${token}\x1b[0m`);
  console.log(`==========================================\n`);
  
  outro("Done!");
}

main().catch(console.error);
