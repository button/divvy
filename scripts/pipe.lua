-- Rate limiter script for Redis. Usage:
--
--   EVALSHA <sha> 1 <keyname> <timeout-seconds> <initial-value>
--
-- If <keyname> exists and is positive, it is decremented.
--
-- If <keyname> doesn't exist, it is created with an initial value
-- of <initial-value> and a TTL of <timeout-seconds>.
--
-- The return value is an array of:
--   * allowed (1 if operation was allowed, 0 otherwise)
--   * remain (number of credits remaining)
--   * ttl (number of seconds remaining)

local ans = redis.call('GET', KEYS[1])

local allowed
local remain

if not ans then
    -- Bucket doesn't exist, set it with timeout.
    allowed = 1
    redis.call('SETEX', KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]))
    remain = tonumber(ARGV[2])
elseif tonumber(ans) > 0 then
    -- Bucket exists and is non-zero, just decrement it.
    allowed = 1
    remain = redis.call('DECR', KEYS[1])
else
    -- Bucket is empty (over quota)
    allowed = 0
    remain = 0
end

local ttl = redis.call('TTL', KEYS[1])

return {allowed, remain, ttl}