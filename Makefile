include .env

.PHONY: up

build :
	docker-compose build

up :
	docker-compose up -d

down :
	docker-compose down

tail :
	docker exec -ti $(CONTAINER) /bin/bash

tail :
	docker logs -f $(CONTAINER)

reset : down up tail
