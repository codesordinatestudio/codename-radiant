import { app } from "./app";

// Import modules so they register with the app
import "./access";
import "./hooks";
import "./custom-routes";

// Start the server
app.start({ port: 3000 }).catch(console.error);
