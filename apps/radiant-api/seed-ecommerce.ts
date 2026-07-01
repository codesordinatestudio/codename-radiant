import { Database } from "bun:sqlite";

async function run() {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer RADIANT_BUILDER_SECRET"
  };

  console.log("1. Creating project...");
  const projRes = await fetch("http://localhost:9100/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "ecommerce-demo" })
  });
  const projData = await projRes.json();
  const projectId = projData.projectId;
  const targetDir = projData.targetDir;
  console.log("Project created:", projectId);

  console.log("2. Adding categories...");
  await fetch(`http://localhost:9100/projects/${projectId}/collections`, {
    method: "POST", headers,
    body: JSON.stringify({
      slug: "categories",
      fields: [{ name: "title", type: "text" }]
    })
  });

  console.log("3. Adding products...");
  await fetch(`http://localhost:9100/projects/${projectId}/collections`, {
    method: "POST", headers,
    body: JSON.stringify({
      slug: "products",
      fields: [
        { name: "title", type: "text" },
        { name: "description", type: "text" },
        { name: "price", type: "number" },
        { name: "image", type: "text" }
      ]
    })
  });

  console.log("4. Running DB Sync...");
  const syncRes = await fetch(`http://localhost:9100/projects/${projectId}/db-sync`, {
    method: "POST", headers
  });
  const syncData = await syncRes.json();
  console.log("Sync output:", syncData.stdout);

  console.log("5. Seeding database with dummy data...");
  const dbPath = `${targetDir}/radiant.sqlite`;
  const db = new Database(dbPath);

  // Insert categories
  db.run(`INSERT INTO categories (id, title, createdAt, updatedAt) VALUES ('cat_1', 'Electronics', datetime('now'), datetime('now'))`);
  db.run(`INSERT INTO categories (id, title, createdAt, updatedAt) VALUES ('cat_2', 'Clothing', datetime('now'), datetime('now'))`);

  // Insert products
  db.run(`INSERT INTO products (id, title, description, price, image, createdAt, updatedAt) VALUES ('prod_1', 'MacBook Pro 16', 'M3 Max 1TB SSD', 3499, 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp16-spaceblack-select-202310', datetime('now'), datetime('now'))`);
  db.run(`INSERT INTO products (id, title, description, price, image, createdAt, updatedAt) VALUES ('prod_2', 'AirPods Pro 2', 'Active Noise Cancelling', 249, 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83', datetime('now'), datetime('now'))`);
  db.run(`INSERT INTO products (id, title, description, price, image, createdAt, updatedAt) VALUES ('prod_3', 'Radiant T-Shirt', 'Premium Cotton T-Shirt', 29, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800', datetime('now'), datetime('now'))`);

  db.close();

  console.log("Done! You can now run the generated backend in:", targetDir);
}

run().catch(console.error);
