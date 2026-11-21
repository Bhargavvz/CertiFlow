.PHONY: up up-scaled down seed test test-docker logs

up:
	docker compose up --build

up-scaled:
	docker compose up --build --scale api=2 --scale worker=3

down:
	docker compose down

seed:
	docker compose run --rm migrate

test:
	docker compose -f docker-compose.test.yml up -d postgres-test redis-test minio-test
	npm test

test-docker:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests

logs:
	docker compose logs -f api worker mock-whatsapp
