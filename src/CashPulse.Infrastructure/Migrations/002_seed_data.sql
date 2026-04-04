-- Migration 002: Seed data
-- Dev user and system categories

-- Dev user (MVP)
INSERT IGNORE INTO Users (Id, Email, DisplayName, BaseCurrency)
VALUES (1, 'dev@local', 'Dev User', 'RUB');

-- System categories (IsSystem=1, UserId=1)
INSERT IGNORE INTO Categories (Id, UserId, Name, ParentId, IsSystem, SortOrder) VALUES
(1,  1, 'Доходы',               NULL, 1, 0),
(2,  1, 'ЗП',                   1,    1, 0),
(3,  1, 'Инвестиции (доход)',    1,    1, 1),
(4,  1, 'Прочие доходы',        1,    1, 2),
(5,  1, 'Расходы',              NULL, 1, 1),
(6,  1, 'Ипотека',              5,    1, 0),
(7,  1, 'Кредитка (погашение)', 5,    1, 1),
(8,  1, 'Быт',                  5,    1, 2),
(9,  1, 'Продукты',             8,    1, 0),
(10, 1, 'Рестораны/Кафе',       8,    1, 1),
(11, 1, 'Подписки',             8,    1, 2),
(12, 1, 'Транспорт',            5,    1, 3),
(13, 1, 'Поездки',              5,    1, 4),
(14, 1, 'Ремонт',               5,    1, 5),
(15, 1, 'Здоровье/Медицина',    5,    1, 6),
(16, 1, 'Образование',          5,    1, 7),
(17, 1, 'Прочее',               5,    1, 8);

-- Initial exchange rates (placeholder, updated from CBR API)
INSERT IGNORE INTO ExchangeRates (FromCurrency, ToCurrency, Rate) VALUES
('RUB', 'RUB', 1.000000),
('USD', 'RUB', 90.000000),
('EUR', 'RUB', 98.000000),
('RUB', 'USD', 0.011111),
('RUB', 'EUR', 0.010204),
('USD', 'EUR', 0.918367),
('EUR', 'USD', 1.088435);
