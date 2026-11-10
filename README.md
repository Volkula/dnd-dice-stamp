# Штамп для дайсов

Статическая страница: открываете STL, кликаете по грани и ставите текст, символ или SVG. Знак можно вдавить в тело или поднять рельефом, затем скачать новый STL.

[![Демо](https://img.shields.io/badge/🌐-Демо-success?style=for-the-badge)](https://volkula.github.io/dnd-dice-stamp/)
[![GitHub](https://img.shields.io/badge/GitHub-Репозиторий-blue?style=for-the-badge&logo=github)](https://github.com/Volkula/dnd-dice-stamp)

Модель должна быть цельным телом без дыр. Единицы знака совпадают с единицами STL, обычно это миллиметры.

## Запуск

Сайт публикуется на GitHub Pages: <https://volkula.github.io/dnd-dice-stamp/>

Локально, как у конвертера масштабов:

```bash
cd dnd-dice-stamp
docker compose up -d
```

Открыть: <http://localhost:8080>

```bash
docker compose down
docker compose logs -f
docker compose build --no-cache
docker compose up -d
```

Правки `index.html`, `styles.css`, `app.js`, `stamp.js` и `geom2d.js` подхватываются томом. После изменения обновите страницу.

Двойной щелчок по `index.html` не подходит: страница собирается из модулей и качает движок с CDN.

## Как пользоваться

1. Откройте STL или возьмите куб 20×20×20.
2. Введите текст или вставьте залитый SVG. Есть заготовки: круг, кольцо, звезда, треугольник.
3. Выберите «Вдавить» или «Поднять», высоту и глубину.
4. Кликните по грани: встанет новый штамп, он сразу выбран.
5. Выбранный штамп правится на месте: измените текст или SVG в поле, размер, глубину, поворот.
6. Штамп можно тянуть мышью. Он скользит по поверхности и ложится по наклону грани под курсором. Shift+клик переносит выбранный штамп в точку клика, Esc снимает выбор.
7. «Нанести на модель» врезает или прибавляет все штампы разом.
8. Скачайте STL.

В шрифте есть латиница и кириллица. Если символа нет, принесите его SVG с заливкой, не одной обводкой.

## Стек

- HTML, CSS, JavaScript без сборки
- three.js, рисование STL
- manifold-3d, булевы операции
- opentype.js и Roboto
- nginx в Docker

## Структура

```
dnd-dice-stamp/
├── index.html
├── styles.css
├── app.js
├── stamp.js
├── geom2d.js
├── samples/cube.stl
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── README.md
```
