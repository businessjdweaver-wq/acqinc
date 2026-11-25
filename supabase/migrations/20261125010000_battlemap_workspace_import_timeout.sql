-- Large scene catalogs contain several megabytes of JSON and can take longer
-- than the default API statement timeout to parse and persist. Keep enough
-- headroom for these saves while the client reports the underlying failure.
ALTER ROLE authenticator SET statement_timeout = '20s';
