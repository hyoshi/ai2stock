// Pin timezone for deterministic test output across local (JST) and CI (UTC) environments.
// Source code formats timestamps via Date.getHours() etc., which depend on local TZ.
process.env.TZ = 'Asia/Tokyo';
