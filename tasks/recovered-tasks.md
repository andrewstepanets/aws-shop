# Recovered Tasks And CDK Migration Notes

Дата восстановления: 2026-05-25.

## Что найдено в проекте

- Frontend-репозиторий: `aws-shop`.
- Основной backend-репозиторий: `shop-back`.
- Устаревший/частичный backend-репозиторий: `shop-be`.

`shop-back` выглядит как правильная основа для миграции: в нем есть история веток `task-3` ... `task-9`, PR-описания, `product-service`, `import-service`, `authorization-service` и `cart-service`. `shop-be` содержит только ранний `product-service` на ветке `home-task-3`, поэтому его лучше считать старым промежуточным вариантом.

Текущий frontend деплоился через Serverless Framework в S3 + CloudFront. Backend деплоился несколькими Serverless-сервисами. При переносе в CDK логично создать в `aws-shop/backend` отдельное CDK-приложение и постепенно перенести туда инфраструктуру из `shop-back`.

## Рекомендуемый порядок миграции на AWS CDK

1. Создать `aws-shop/backend` как отдельное CDK-приложение на TypeScript.
2. Перенести исходники backend из `shop-back` внутрь `aws-shop/backend/services` или `aws-shop/backend/src/services`, сохранив разделение на `product-service`, `import-service`, `authorization-service`, `cart-service`.
3. В CDK описать инфраструктуру стек за стеком в том же порядке, что и старые учебные задачи: frontend hosting, product API, DynamoDB, S3 import, SQS/SNS pipeline, authorizer, cart API, docker/containerization.
4. Обновить frontend env/config так, чтобы он брал новые CDK outputs: Product API URL, Import API URL, Cart API URL, CloudFront URL.
5. После каждого перенесенного блока запускать локальные тесты сервиса и `cdk synth`.

## Task 2: Frontend hosting in S3 and CloudFront

Источник:

- Frontend PR: https://github.com/andrewstepanets/aws-shop/pull/1
- Ветка: `aws-shop/home-task1`

Содержание задачи:

- Собрать SPA-приложение.
- Выполнить ручной деплой frontend в S3 static website bucket.
- Настроить автоматический деплой через Serverless Framework и `serverless-finch`.
- Настроить альтернативный деплой через `serverless-single-page-app-plugin`.
- Создать S3 bucket для `dist`.
- Создать CloudFront distribution.
- Настроить fallback `404 -> /index.html` для SPA routing.
- Настроить CloudFront Origin Access Identity и bucket policy.

Что переносить в CDK:

- S3 bucket для frontend assets.
- CloudFront distribution.
- Origin access control или современный аналог OAI.
- SPA fallback routing.
- Bucket deployment из локального `dist`.

## Task 3: Product Service with basic product endpoints

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/1
- Frontend PR: https://github.com/andrewstepanets/aws-shop/pull/2
- Backend ветка: `shop-back/task-3`
- Frontend ветка: `aws-shop/home-task-3`

Содержание задачи:

- Создать `product-service`.
- Реализовать `GET /products`.
- Реализовать `GET /products/{productId}`.
- Подключить frontend к backend endpoint для списка продуктов.
- Использовать ES modules в Product Service.
- Настроить bundling через Webpack/ESBuild.
- Создать Swagger-документацию для Product Service.
- Покрыть lambda handlers базовыми unit-тестами.
- Разнести handlers `getProductsList` и `getProductById` по отдельным модулям.
- Обработать основные ошибки API, включая `Product not found`.

Что переносить в CDK:

- Lambda functions для `getProductsList` и `getProductById`.
- API Gateway routes.
- Bundling TypeScript lambdas через `aws-cdk-lib/aws-lambda-nodejs`.
- CORS и единый формат ошибок.

## Task 4: DynamoDB persistence and product creation

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/2
- Backend ветка: `shop-back/task-4`

Содержание задачи:

- Создать DynamoDB storage для продуктов.
- Реализовать `GET /products` с чтением из базы.
- Реализовать `GET /products/{productId}` с чтением из базы.
- Реализовать `POST /products` для создания продукта.
- Хранить продукты в базе.
- Возвращать `400`, если данные продукта невалидны.
- Возвращать `500` на ошибки базы или необработанные ошибки.
- Логировать входящие requests и arguments.
- В PR также отмечен optional пункт про RDS и transaction-based creation, но фактическая конфигурация `product-service` использует DynamoDB tables `products` и `stocks`.

Что переносить в CDK:

- DynamoDB tables `products` и `stocks`.
- IAM permissions для product lambdas.
- Lambda env vars `PRODUCTS_TABLE` и `STOCKS_TABLE`.
- Route `POST /products`.
- Initial data/populate script как отдельный seed-механизм или custom command.

## Task 5: Import Service and S3 integration

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/3
- Frontend PR: https://github.com/andrewstepanets/aws-shop/pull/3
- Backend ветка: `shop-back/task-5`
- Frontend ветка: `aws-shop/task-5`

Содержание задачи:

- Создать новый `import-service`.
- Создать и настроить S3 bucket с папкой `uploaded`.
- Создать lambda `importProductsFile`.
- Endpoint должен быть `/import`.
- `importProductsFile` должен принимать имя CSV-файла и возвращать signed URL для загрузки в `uploaded/${fileName}`.
- Создать lambda `importFileParser`.
- Запускать `importFileParser` на S3 event `s3:ObjectCreated:*`.
- Парсить CSV-файл.
- После обработки перемещать файл из `uploaded` в `parsed`.
- Покрыть `importProductsFile` unit-тестами.
- На frontend добавить admin/import flow для загрузки CSV.

Что переносить в CDK:

- S3 bucket для import flow.
- Lambda `importProductsFile`.
- Lambda `importFileParser`.
- API Gateway route `GET /import`.
- S3 notification на parser lambda.
- IAM permissions на чтение, запись, copy/delete объектов.

## Task 6: SQS/SNS catalog batch pipeline

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/4
- Backend ветка: `shop-back/task-6`

Содержание задачи:

- Создать lambda `catalogBatchProcess`.
- Создать SQS queue `catalogItemsQueue`.
- Настроить SQS trigger для `catalogBatchProcess` с `batchSize: 5`.
- Обновить `importFileParser`, чтобы каждая CSV-запись отправлялась в SQS.
- Создать SNS topic `createProductTopic`.
- Создать email subscription для SNS.
- Покрыть `catalogBatchProcess` unit-тестами.
- Добавить filtering для low stock notification.

Что переносить в CDK:

- SQS queue.
- SNS topic и subscriptions.
- Event source mapping SQS -> `catalogBatchProcess`.
- Queue URL/ARN wiring между import и product stack.
- IAM permissions `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sns:Publish`.

## Task 7: Authorization Service and protected import

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/5
- Frontend PR: https://github.com/andrewstepanets/aws-shop/pull/4
- Backend ветка: `shop-back/task-7`
- Frontend ветка: `aws-shop/task-7`

Содержание задачи:

- Добавить `authorization-service`.
- Реализовать `basicAuthorizer` lambda.
- Настроить authorizer для `importProductsFile`.
- Если `Authorization` header отсутствует, возвращать `401`.
- Если token невалидный или пользователь не разрешен, возвращать `403`.
- На frontend отправлять header `Authorization: Basic <authorization_token>` при import.
- Брать `authorization_token` из `localStorage`.
- Показывать alerts для ответов `401` и `403`.

Что переносить в CDK:

- Lambda request/token authorizer.
- Secrets или SSM parameters для credentials вместо `.env` в репозитории.
- API Gateway authorizer attachment на `/import`.
- Gateway responses для CORS на `401/403/4XX`.

## Task 8: Cart Service and frontend integration

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/6
- Frontend PR: https://github.com/andrewstepanets/aws-shop/pull/5
- Backend ветка: `shop-back/task-8`
- Frontend ветка: `aws-shop/task-8`

Содержание задачи:

- Добавить Cart Service.
- Реализовать cart API.
- Хранить cart data в DB.
- Создать `orders` table и интегрировать `Order` model.
- Создать `users` table и интегрировать user model.
- Реализовать transaction-based checkout creation.
- Интегрировать Cart Service с frontend.
- В текущем коде `cart-service` реализован как NestJS app с TypeORM/PostgreSQL и Serverless endpoint `ANY /` + `ANY /{proxy+}`.

Что переносить в CDK:

- Вариант A: оставить NestJS cart как Lambda через `@vendia/serverless-express`.
- Вариант B: перевести cart в ECS/Fargate, если нужен полноценный long-running NestJS service.
- PostgreSQL/RDS или другой совместимый persistence layer.
- Secrets для `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USERNAME`, `PG_PASSWORD`.
- API Gateway route/proxy для cart service.

## Task 9: Dockerization of Cart Service

Источник:

- Backend PR: https://github.com/andrewstepanets/shop-back/pull/7
- Backend ветка: `shop-back/task-9`
- PR body пустой; описание восстановлено по diff ветки.

Содержание задачи:

- Добавить `cart-service/Dockerfile`.
- Добавить `cart-service/.dockerignore`.
- Подготовить Cart Service к запуску/деплою как Docker image.

Что переносить в CDK:

- Если выбираем Lambda container image: ECR asset + Lambda from Docker image.
- Если выбираем ECS/Fargate: ECR asset, ECS cluster, task definition, service, ALB/API Gateway integration.
- На 2026 год для CDK лучше использовать актуальный Node runtime/base image вместо старого `nodejs14.x`.

## Важные замечания перед переписыванием

- Старые Serverless конфиги используют `nodejs14.x`, он устарел; при миграции лучше целиться минимум в Node.js 20/22.
- Старые имена AWS resources частично захардкожены: `products`, `stocks`, `shop-import-back-end`, `andrews-react-bucket-2`. В CDK лучше сделать имена параметризуемыми по stage.
- Email subscriptions в SNS содержат личные email; лучше вынести их в config/context.
- Пароли и credentials authorizer/cart database не должны лежать в `.env` в репозитории; лучше использовать Secrets Manager или SSM Parameter Store.
- Для CDK лучше разделить infrastructure code и runtime code, но держать их в одном `aws-shop/backend` workspace.
