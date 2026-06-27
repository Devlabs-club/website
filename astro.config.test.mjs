import base from "./astro.config.mjs";

export default {
  ...base,
  adapter: undefined,
  output: "static",
  integrations: base.integrations?.filter((i) => i?.name !== "@astrojs/vercel"),
};
