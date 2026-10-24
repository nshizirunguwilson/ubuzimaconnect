# Data files

## sectors.json

Rwanda's 416 sectors with their district, province and centre point. Used for the manual location fallback (FR 3.4: "use the centre of that sector as the location").

- **Source:** National Institute of Statistics of Rwanda (NISR), *Rwanda – Subnational Administrative Boundaries*, via the Humanitarian Data Exchange (HDX), dataset `cod-ab-rwa`, file `rwa_adm_2006_NISR_WGS1984_20181002_SHP.zip`, downloaded 24 Oct 2026.
- **Licence:** Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO).
- **How it was made:** the centre of each sector is the area-weighted centroid of its boundary in the adm3 shapefile. Only names, codes and centre points are kept; the boundaries are not in this repository.
