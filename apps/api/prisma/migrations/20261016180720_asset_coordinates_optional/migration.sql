-- Koordinat isteğe bağlı: konumu henüz bilinmeyen eserler de yayında olabilir.
-- Koordinatı olmayan eser haritada ve yakındaki eserlerde görünmez (API lat/lng NULL döner).
ALTER TABLE "asset" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- lat ve lng ya ikisi birden dolu ya ikisi birden boş (Prisma CHECK kısıtını ifade edemez).
ALTER TABLE "asset" ADD CONSTRAINT "asset_coordinates_pair" CHECK ((lat IS NULL) = (lng IS NULL));
