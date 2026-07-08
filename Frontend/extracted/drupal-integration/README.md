# Drupal integration — jijiwishasociety.org

These are the two files modified in the main website's Drupal 7 theme
(`sites/all/themes/medical_zymphonies_theme/`) to add the **POSH Compass**
item to the main navigation bar.

| File in this folder | Deploy to |
|---|---|
| `templates/page.tpl.php` | `sites/all/themes/medical_zymphonies_theme/templates/page.tpl.php` |
| `css/style.css` | `sites/all/themes/medical_zymphonies_theme/css/style.css` |

## What the change does

- `page.tpl.php` appends a `POSH Compass` `<li>` as the last item of the
  rendered main menu, linking to `/posh-compass/`.
- `style.css` (rules appended at the end of the file) gives that item the
  POSH Compass orange (`#e8720c`) with a ✦ compass star.

## Deployment steps

1. Upload the two files above to the theme (overwrite), **or** deploy the full
   packaged site from `jijiwisha_with_posh_compass.zip`.
2. Upload this repository's static site into a `posh-compass/` folder inside
   the Drupal docroot (the folder must contain `index.html`, `css/`, `js/`).
3. Clear Drupal caches: Admin → Configuration → Performance → *Clear all caches*.

## Alternative (no code change)

The same menu item can be added through the Drupal admin UI instead:
*Structure → Menus → Main menu → Add link* with path `posh-compass/`.
If you do that, revert the `page.tpl.php` change so the item does not appear twice.
