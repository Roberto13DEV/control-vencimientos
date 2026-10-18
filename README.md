# Control de vencimientos — nueva versión

Aplicación PHP/MySQL reconstruida con autenticación segura, inventario, alertas, usuarios e historial.

## Instalación local

1. Copia `.env.example` como `.env`.
2. Importa `database.sql` desde phpMyAdmin.
3. Copia el proyecto a `C:\xampp\htdocs\control_vencimientos_nuevo`.
4. Abre `http://localhost/control_vencimientos_nuevo`.
5. Crea el primer administrador desde la pantalla inicial.

Requiere PHP 8.1+ y MySQL/MariaDB.


## Actualizar una base de datos existente

Si instalaste una versión anterior (con "Avisar días antes"), ejecuta en phpMyAdmin:

```sql
ALTER TABLE productos ADD COLUMN fecha_cambio DATE NULL AFTER aviso_dias;
UPDATE productos SET fecha_cambio = DATE_SUB(vencimiento, INTERVAL aviso_dias DAY) WHERE tiene_cambio = 1;
```
