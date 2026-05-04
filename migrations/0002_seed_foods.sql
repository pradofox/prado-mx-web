-- Migration 0002: seed inicial de alimentos prototipo (SMAE)
-- ~120 alimentos cubriendo los 16 grupos con porciones estándar.

DELETE FROM foods;

-- Verduras (1 eq = 25 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('v01', 'verduras', 'Nopal cocido', '1 taza'),
  ('v02', 'verduras', 'Brócoli cocido', '1/2 taza'),
  ('v03', 'verduras', 'Espinaca cruda', '2 tazas'),
  ('v04', 'verduras', 'Zanahoria rallada', '1/2 taza'),
  ('v05', 'verduras', 'Jitomate', '1 mediano'),
  ('v06', 'verduras', 'Pepino', '1 mediano'),
  ('v07', 'verduras', 'Calabacita', '3/4 taza'),
  ('v08', 'verduras', 'Chayote cocido', '1 taza'),
  ('v09', 'verduras', 'Lechuga romana', '3 tazas'),
  ('v10', 'verduras', 'Champiñones', '1 taza');

-- Frutas (1 eq = 60 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('f01', 'frutas', 'Plátano', '1/2 mediano'),
  ('f02', 'frutas', 'Manzana', '1 mediana'),
  ('f03', 'frutas', 'Papaya', '1 taza'),
  ('f04', 'frutas', 'Piña', '3/4 taza'),
  ('f05', 'frutas', 'Fresa', '1 taza'),
  ('f06', 'frutas', 'Mango', '1/2 mediano'),
  ('f07', 'frutas', 'Uvas', '15 piezas'),
  ('f08', 'frutas', 'Naranja', '1 mediana'),
  ('f09', 'frutas', 'Sandía', '1 taza'),
  ('f10', 'frutas', 'Pera', '1 mediana'),
  ('f11', 'frutas', 'Melón', '1 taza'),
  ('f12', 'frutas', 'Durazno', '1 mediano');

-- Cereales sin grasa (1 eq = 70 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('cs01', 'cereales-sg', 'Tortilla de maíz', '1 pieza'),
  ('cs02', 'cereales-sg', 'Arroz integral cocido', '1/3 taza'),
  ('cs03', 'cereales-sg', 'Pan integral', '1 rebanada'),
  ('cs04', 'cereales-sg', 'Avena cocida', '1/2 taza'),
  ('cs05', 'cereales-sg', 'Pasta cocida', '1/2 taza'),
  ('cs06', 'cereales-sg', 'Papa cocida', '1/2 taza'),
  ('cs07', 'cereales-sg', 'Camote', '1/3 taza'),
  ('cs08', 'cereales-sg', 'Elote desgranado', '1/2 taza'),
  ('cs09', 'cereales-sg', 'Quinoa cocida', '1/2 taza'),
  ('cs10', 'cereales-sg', 'Tortilla de nopal', '1 pieza');

-- Cereales con grasa (1 eq = 115 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('cg01', 'cereales-cg', 'Pan dulce', '1/2 pieza'),
  ('cg02', 'cereales-cg', 'Bisquet', '1 pieza'),
  ('cg03', 'cereales-cg', 'Bolillo', '1/2 pieza'),
  ('cg04', 'cereales-cg', 'Galletas saladas', '4 piezas'),
  ('cg05', 'cereales-cg', 'Waffle', '1 pieza'),
  ('cg06', 'cereales-cg', 'Granola comercial', '1/4 taza');

-- Leguminosas (1 eq = 120 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('lg01', 'leguminosas', 'Frijoles cocidos', '1/2 taza'),
  ('lg02', 'leguminosas', 'Lentejas cocidas', '1/2 taza'),
  ('lg03', 'leguminosas', 'Garbanzos cocidos', '1/2 taza'),
  ('lg04', 'leguminosas', 'Habas cocidas', '1/2 taza'),
  ('lg05', 'leguminosas', 'Frijol negro', '1/2 taza'),
  ('lg06', 'leguminosas', 'Hummus', '1/3 taza');

-- AOA muy bajo grasa (1 eq = 40 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('mb01', 'aoa-mb', 'Pechuga de pollo sin piel', '30 g'),
  ('mb02', 'aoa-mb', 'Atún en agua', '40 g'),
  ('mb03', 'aoa-mb', 'Pescado blanco', '40 g'),
  ('mb04', 'aoa-mb', 'Clara de huevo', '2 piezas'),
  ('mb05', 'aoa-mb', 'Tilapia', '40 g'),
  ('mb06', 'aoa-mb', 'Pavo magro', '30 g'),
  ('mb07', 'aoa-mb', 'Mero', '40 g');

-- AOA bajo grasa (1 eq = 55 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('b01', 'aoa-b', 'Pollo con piel', '30 g'),
  ('b02', 'aoa-b', 'Filete de res', '30 g'),
  ('b03', 'aoa-b', 'Arrachera magra', '30 g'),
  ('b04', 'aoa-b', 'Salmón', '30 g'),
  ('b05', 'aoa-b', 'Camarón', '40 g'),
  ('b06', 'aoa-b', 'Atún en aceite', '30 g'),
  ('b07', 'aoa-b', 'Lomo de cerdo', '30 g');

-- AOA moderado grasa (1 eq = 75 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('m01', 'aoa-m', 'Huevo entero', '1 pieza'),
  ('m02', 'aoa-m', 'Queso panela', '40 g'),
  ('m03', 'aoa-m', 'Queso oaxaca', '30 g'),
  ('m04', 'aoa-m', 'Bistec con grasa visible', '30 g'),
  ('m05', 'aoa-m', 'Queso cottage', '1/4 taza'),
  ('m06', 'aoa-m', 'Pierna de cerdo', '30 g');

-- AOA alto grasa (1 eq = 100 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('a01', 'aoa-a', 'Tocino', '2 rebanadas'),
  ('a02', 'aoa-a', 'Chorizo', '30 g'),
  ('a03', 'aoa-a', 'Longaniza', '30 g'),
  ('a04', 'aoa-a', 'Queso amarillo', '30 g'),
  ('a05', 'aoa-a', 'Salchicha', '1 pieza'),
  ('a06', 'aoa-a', 'Costilla de res', '30 g');

-- Leche descremada (1 eq = 95 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('ld01', 'leche-d', 'Leche descremada', '1 taza'),
  ('ld02', 'leche-d', 'Yogurt natural light', '1 taza'),
  ('ld03', 'leche-d', 'Yogurt griego light', '3/4 taza'),
  ('ld04', 'leche-d', 'Leche deslactosada light', '1 taza');

-- Leche semi (1 eq = 110 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('ls01', 'leche-s', 'Leche 2%', '1 taza'),
  ('ls02', 'leche-s', 'Yogurt natural', '3/4 taza'),
  ('ls03', 'leche-s', 'Leche de cabra', '1 taza');

-- Leche entera (1 eq = 150 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('le01', 'leche-e', 'Leche entera', '1 taza'),
  ('le02', 'leche-e', 'Yogurt entero', '1 taza'),
  ('le03', 'leche-e', 'Leche de almendra entera', '1 taza');

-- Aceites sin proteína (1 eq = 45 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('as01', 'aceites-sp', 'Aceite de oliva', '1 cdita'),
  ('as02', 'aceites-sp', 'Aguacate', '1/3 pieza'),
  ('as03', 'aceites-sp', 'Aceitunas', '5 piezas'),
  ('as04', 'aceites-sp', 'Mantequilla', '1 cdita'),
  ('as05', 'aceites-sp', 'Mayonesa', '1 cdita'),
  ('as06', 'aceites-sp', 'Aceite de coco', '1 cdita'),
  ('as07', 'aceites-sp', 'Aderezo cremoso', '1 cda');

-- Aceites con proteína (1 eq = 70 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('ap01', 'aceites-cp', 'Nueces', '3 mitades'),
  ('ap02', 'aceites-cp', 'Almendras', '10 piezas'),
  ('ap03', 'aceites-cp', 'Cacahuates', '14 piezas'),
  ('ap04', 'aceites-cp', 'Pepitas', '2 cdas'),
  ('ap05', 'aceites-cp', 'Semillas de chía', '1 cda'),
  ('ap06', 'aceites-cp', 'Crema de cacahuate', '1 cda'),
  ('ap07', 'aceites-cp', 'Pistaches', '18 piezas');

-- Azúcar sin grasa (1 eq = 40 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('zs01', 'azucar-sg', 'Azúcar', '2 cditas'),
  ('zs02', 'azucar-sg', 'Miel', '1 cdita'),
  ('zs03', 'azucar-sg', 'Mermelada', '2 cditas'),
  ('zs04', 'azucar-sg', 'Gomitas', '3 piezas');

-- Azúcar con grasa (1 eq = 85 kcal)
INSERT INTO foods (id, group_key, name, portion) VALUES
  ('zc01', 'azucar-cg', 'Chocolate amargo', '1 cuadro'),
  ('zc02', 'azucar-cg', 'Helado', '1/3 taza'),
  ('zc03', 'azucar-cg', 'Galleta dulce', '1 pieza'),
  ('zc04', 'azucar-cg', 'Pastel sencillo', '1 reb pequeña');
