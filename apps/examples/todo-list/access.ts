import { app } from "./app";

// Attach access control rules
app.access("users", {
  // Anyone can read
  read: (ctx) => true,
  // Only admins can create
  create: (ctx) => ctx.user?.role === "admin",
});

app.access("todos", {
  // Anyone can read/write for demo
  read: () => true,
  create: () => true,
  update: () => true,
  delete: () => true,
});
