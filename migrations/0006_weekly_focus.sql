-- Migration 0006: weekly_focus
-- Roadmap semanal de Protocolo 12. 12 semanas predefinidas que Hugo edita
-- desde admin. Se muestran en el dashboard del usuario contextualizando
-- "en qué semana voy y qué toca".

CREATE TABLE IF NOT EXISTS weekly_focus (
  week_number INTEGER PRIMARY KEY,   -- 1..12
  title TEXT NOT NULL,
  description TEXT,
  habit TEXT,
  updated_at TEXT NOT NULL
);

-- Seed con un arco razonable de coaching nutricional. Hugo retoca el copy.
INSERT OR IGNORE INTO weekly_focus (week_number, title, description, habit, updated_at) VALUES
(1,  'Hidratación y ritmo de comidas',     'Arrancamos con lo más básico y lo más subestimado: agua suficiente y horarios consistentes. El cuerpo se calibra primero en el reloj, después en los macros.',                  'Toma 2L de agua al día. Come en horarios fijos +/- 1 hora.',                       datetime('now')),
(2,  'Estructura de proteína por tiempo',  'Cada comida lleva una porción clara de proteína. No la suma del día, la distribución por tiempo. Esa es la diferencia entre sentirte lleno y andar picando.',           'Mide tu proteína en cada tiempo. Una porción palma de mano.',                       datetime('now')),
(3,  'Carbohidratos: calidad y timing',    'No los quitamos, los ordenamos. Los complejos arriba, los simples alrededor del entrenamiento. Energía estable en lugar de picos.',                                  'Carbohidrato complejo en desayuno y comida. Fruta como colación.',                  datetime('now')),
(4,  'Grasas que valen la pena',           'Aguacate, aceite de oliva, nueces, pescado azul. Cantidad pequeña, calidad alta. Saciedad y hormonas.',                                                              'Una porción de grasa buena en al menos 2 tiempos del día.',                         datetime('now')),
(5,  'Verduras como base',                 'Mitad del plato en comida y cena. Variedad de color. No es adorno, es el fondo sobre el que se construye todo.',                                                  'Dos colores distintos de verdura en comida y cena.',                                datetime('now')),
(6,  'Fibra y fruta entera',               'Fruta sí, jugo no. Fibra de cereal integral y verdura. La microbiota se nota en una semana cuando das este paso.',                                              'Cambia jugos por fruta entera. Cereales integrales por default.',                   datetime('now')),
(7,  'Colaciones que no descalibran',      'Las colaciones son donde se rompe el plan. Las preparamos: portátiles, proporcionadas, sin sorpresas.',                                                            'Arma 3 colaciones default para tener listas cuando te pegue el hambre.',            datetime('now')),
(8,  'Ajuste de porciones',                'Revisamos como va. Si bajaste 1-2 kg por semana, vamos bien. Si fue más rápido o muy lento, ajustamos. Sin drama.',                                            'Pésate al despertar dos días esta semana. Promedia.',                               datetime('now')),
(9,  'Comer fuera sin descalibrarse',      'Restaurantes, antros, fiestas. Estrategias concretas: pedir aparte, sustituciones, qué evitar. La vida social se acomoda al sistema, no al revés.',          'Una salida esta semana con plan: qué vas a pedir antes de llegar.',                 datetime('now')),
(10, 'Fin de semana',                      'Sabados y domingos son el 30% de tu semana. Si se descalibran, no hay lunes que recupere. Definimos qué se relaja y qué se queda firme.',                       'Tres reglas tuyas para fin de semana. Escritas, no en la cabeza.',                  datetime('now')),
(11, 'Recomposición vs. déficit',          'A estas alturas tu cuerpo ya respondió. Decidimos si seguimos en déficit, mantenemos, o entramos en recomposición con el entrenamiento.',                       'Conversación de 10 minutos con Hugo en el Q&A sobre tu siguiente fase.',            datetime('now')),
(12, 'Cierre: tu sistema',                 'Cerramos consolidando lo que ya hace clic. Macros, equivalencias, hábitos, reglas. El sistema se queda tuyo. La descarga del PDF final es el cierre.',         'Descarga tu PDF "Tu sistema PRADO". Imprimelo y pegalo en la cocina.',              datetime('now'));
