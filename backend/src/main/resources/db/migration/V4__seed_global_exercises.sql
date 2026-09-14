-- Ćwiczenia globalne (user_id NULL) widoczne dla każdego konta. UUID-y
-- ustawione ręcznie na stały wzorzec (00000000-0000-0000-0000-0000000000XX),
-- żeby seed był idempotentny (ON CONFLICT DO NOTHING) i łatwy do
-- zreferencjonowania w danych testowych / seedach dev.

INSERT INTO exercises (id, user_id, name, muscle_group, equipment) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'Wyciskanie sztangi na ławce płaskiej', 'klatka piersiowa', 'barbell'),
    ('00000000-0000-0000-0000-000000000002', NULL, 'Wyciskanie sztangi na ławce skośnej', 'klatka piersiowa', 'barbell'),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Wyciskanie hantli na ławce płaskiej', 'klatka piersiowa', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000004', NULL, 'Wyciskanie hantli na ławce skośnej', 'klatka piersiowa', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000005', NULL, 'Rozpiętki z hantlami', 'klatka piersiowa', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000006', NULL, 'Rozpiętki na wyciągu', 'klatka piersiowa', 'cable'),
    ('00000000-0000-0000-0000-000000000007', NULL, 'Pompki', 'klatka piersiowa', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000008', NULL, 'Wyciskanie na maszynie (chest press)', 'klatka piersiowa', 'machine'),

    ('00000000-0000-0000-0000-000000000009', NULL, 'Martwy ciąg', 'plecy', 'barbell'),
    ('00000000-0000-0000-0000-000000000010', NULL, 'Wiosłowanie sztangą', 'plecy', 'barbell'),
    ('00000000-0000-0000-0000-000000000011', NULL, 'Wiosłowanie hantlą w opadzie', 'plecy', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000012', NULL, 'Podciąganie na drążku', 'plecy', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000013', NULL, 'Ściąganie drążka wyciągu górnego', 'plecy', 'cable'),
    ('00000000-0000-0000-0000-000000000014', NULL, 'Wiosłowanie na maszynie', 'plecy', 'machine'),
    ('00000000-0000-0000-0000-000000000015', NULL, 'Wiosłowanie na wyciągu niskim', 'plecy', 'cable'),
    ('00000000-0000-0000-0000-000000000016', NULL, 'Martwy ciąg rumuński', 'plecy', 'barbell'),

    ('00000000-0000-0000-0000-000000000017', NULL, 'Przysiad ze sztangą', 'nogi', 'barbell'),
    ('00000000-0000-0000-0000-000000000018', NULL, 'Przysiad bułgarski', 'nogi', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000019', NULL, 'Wykroki z hantlami', 'nogi', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000020', NULL, 'Prasa nożna (suwnica)', 'nogi', 'machine'),
    ('00000000-0000-0000-0000-000000000021', NULL, 'Wyprosty nóg na maszynie', 'nogi', 'machine'),
    ('00000000-0000-0000-0000-000000000022', NULL, 'Uginanie nóg leżąc na maszynie', 'nogi', 'machine'),
    ('00000000-0000-0000-0000-000000000023', NULL, 'Hip thrust ze sztangą', 'pośladki', 'barbell'),
    ('00000000-0000-0000-0000-000000000024', NULL, 'Martwy ciąg na prostych nogach', 'nogi', 'barbell'),
    ('00000000-0000-0000-0000-000000000025', NULL, 'Przysiad w hack maszynie', 'nogi', 'machine'),
    ('00000000-0000-0000-0000-000000000026', NULL, 'Wspięcia na palce stojąc', 'łydki', 'machine'),

    ('00000000-0000-0000-0000-000000000027', NULL, 'Wyciskanie żołnierskie sztangą', 'barki', 'barbell'),
    ('00000000-0000-0000-0000-000000000028', NULL, 'Wyciskanie hantli nad głowę', 'barki', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000029', NULL, 'Unoszenie hantli bokiem', 'barki', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000030', NULL, 'Unoszenie hantli w opadzie tułowia', 'barki', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000031', NULL, 'Face pull na wyciągu', 'barki', 'cable'),
    ('00000000-0000-0000-0000-000000000032', NULL, 'Wyciskanie na maszynie barkowej', 'barki', 'machine'),

    ('00000000-0000-0000-0000-000000000033', NULL, 'Uginanie ramion ze sztangą', 'biceps', 'barbell'),
    ('00000000-0000-0000-0000-000000000034', NULL, 'Uginanie ramion z hantlami', 'biceps', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000035', NULL, 'Uginanie modlitewne ze sztangą EZ', 'biceps', 'barbell'),
    ('00000000-0000-0000-0000-000000000036', NULL, 'Uginanie na modlitewniku (maszyna)', 'biceps', 'machine'),
    ('00000000-0000-0000-0000-000000000037', NULL, 'Uginanie ramion na wyciągu', 'biceps', 'cable'),

    ('00000000-0000-0000-0000-000000000038', NULL, 'Wyciskanie francuskie', 'triceps', 'barbell'),
    ('00000000-0000-0000-0000-000000000039', NULL, 'Prostowanie ramion na wyciągu górnym', 'triceps', 'cable'),
    ('00000000-0000-0000-0000-000000000040', NULL, 'Pompki na poręczach (dipy)', 'triceps', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000041', NULL, 'Prostowanie ramienia z hantlą nad głową', 'triceps', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000042', NULL, 'Wyciskanie na maszynie na triceps', 'triceps', 'machine'),

    ('00000000-0000-0000-0000-000000000043', NULL, 'Deska (plank)', 'brzuch', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000044', NULL, 'Brzuszki', 'brzuch', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000045', NULL, 'Unoszenie nóg w zwisie', 'brzuch', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000046', NULL, 'Skręty tułowia z hantlą', 'brzuch', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000047', NULL, 'Wyciskanie brzucha na maszynie', 'brzuch', 'machine'),
    ('00000000-0000-0000-0000-000000000048', NULL, 'Kółko do brzucha', 'brzuch', 'other'),

    ('00000000-0000-0000-0000-000000000049', NULL, 'Odwodzenie nogi na maszynie (pośladki)', 'pośladki', 'machine'),
    ('00000000-0000-0000-0000-000000000050', NULL, 'Odwodzenie nogi na wyciągu', 'pośladki', 'cable'),
    ('00000000-0000-0000-0000-000000000051', NULL, 'Wykroki chodzone z hantlami', 'pośladki', 'dumbbell'),
    ('00000000-0000-0000-0000-000000000052', NULL, 'Hip thrust na maszynie', 'pośladki', 'machine'),

    ('00000000-0000-0000-0000-000000000053', NULL, 'Wspięcia na palce siedząc', 'łydki', 'machine'),
    ('00000000-0000-0000-0000-000000000054', NULL, 'Wspięcia na palce ze sztangą', 'łydki', 'barbell'),

    ('00000000-0000-0000-0000-000000000055', NULL, 'Uginanie nadgarstków ze sztangą', 'przedramiona', 'barbell'),
    ('00000000-0000-0000-0000-000000000056', NULL, 'Zwis na drążku', 'przedramiona', 'bodyweight'),

    ('00000000-0000-0000-0000-000000000057', NULL, 'Wiosłowanie na ergometrze', 'całe ciało', 'other'),
    ('00000000-0000-0000-0000-000000000058', NULL, 'Berpsy', 'całe ciało', 'bodyweight'),
    ('00000000-0000-0000-0000-000000000059', NULL, 'Skakanka', 'całe ciało', 'other'),
    ('00000000-0000-0000-0000-000000000060', NULL, 'Farmer walk z hantlami', 'całe ciało', 'dumbbell')
ON CONFLICT (id) DO NOTHING;
