-- Kaydettiklerim: rotaların yanında Rehber'in yemek önerileri ve toplu taşıma tarifleri de hesapta saklanır.
ALTER TABLE user_route DROP CONSTRAINT user_route_kind_check;
ALTER TABLE user_route ADD CONSTRAINT user_route_kind_check CHECK (kind IN ('planner', 'trip', 'food', 'transit'));
