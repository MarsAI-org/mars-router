docker stop mars-router
docker rm mars-router
docker build -t mars-router .
docker run -d --name mars-router -p 20128:20128 --env-file .env -v mars-router-data:/app/data mars-router
