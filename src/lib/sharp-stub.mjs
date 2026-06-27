/** Stub for Cloudflare Workers — sharp native binaries are not supported at runtime. */
const noop = () => {
  throw new Error("Image optimization (sharp) is disabled on Cloudflare Workers.");
};

export default {
  cache: noop,
};
