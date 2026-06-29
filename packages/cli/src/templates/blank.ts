export const blankTemplate = `config {
  core: {
    api: {
      prefix: "/api"
    }
  };

  security: {
    auth: {
      strategies: ["jwt"],
      jwt: {
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      }
    }
  };

  monitoring: {
    healthCheck: {
      enabled: true,
      path: "/health"
    }
  };
}

collection users {
  auth: true;
  fields: {
    name: text;
    email: email @unique;
    password: password;
    role: text @default("user");
  }
}
`;
