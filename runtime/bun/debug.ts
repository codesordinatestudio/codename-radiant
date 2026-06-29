import { Type } from "@sinclair/typebox";
import { generateOpenAPISpec } from "./src/core/openapi.ts";

const appRoutes = {
routes: [
    {
    method: "post",
    path: "/api/custom/hello",
    hooks: {
        response: {
        200: Type.Object({
            message: Type.String()
        })
        }
    }
    }
]
};

console.log(Object.entries(appRoutes.routes[0].hooks.response));
const keys = Object.keys(appRoutes.routes[0].hooks.response);
console.log(keys);

