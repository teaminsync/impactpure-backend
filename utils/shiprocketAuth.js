// Shiprocket tokens are cached in the database. If Shiprocket answers 401 the cached token has gone
// stale: log in again once, store the new token and repeat the same call once.
// Everything is injected, so this can be tested without the network.
export const createShiprocketRefresh = ({ axios, baseUrl, email, password, tokenModel, log = console.error }) =>
  async (error) => {
    const config = error && error.config;
    const status = error && error.response && error.response.status;
    const url = config && typeof config.url === "string" ? config.url : "";
    if (
      status !== 401 ||
      !baseUrl ||
      !url.startsWith(baseUrl) ||
      url.endsWith("/auth/login") ||
      config._shiprocketRetried
    ) {
      throw error;
    }
    config._shiprocketRetried = true;

    let token;
    try {
      const login = await axios.post(
        `${baseUrl}/auth/login`,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );
      token = login && login.data && login.data.token;
      if (!token) throw new Error("Shiprocket login returned no token");
      await tokenModel.deleteMany({});
      await tokenModel.create({ token });
    } catch (loginError) {
      log("Shiprocket re-login failed:", loginError && loginError.message);
      throw error;
    }

    if (config.headers && typeof config.headers.set === "function") {
      config.headers.set("Authorization", `Bearer ${token}`);
    } else {
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
    }
    return axios(config);
  };
