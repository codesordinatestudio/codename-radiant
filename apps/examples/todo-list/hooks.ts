import { app } from "./app";

// Attach hooks
app.hooks("todos", {
  beforeCreate: async (ctx) => {
    console.log("Hook intercepted beforeCreate for Todo:", ctx.data);
    ctx
    // Automatically assign author if not provided
    if (!ctx.data.author) ctx.data.author = ctx.user?.id || "anonymous";
    return ctx.data;
  },
});
