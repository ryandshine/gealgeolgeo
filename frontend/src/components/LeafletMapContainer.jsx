import React from 'react';
import { MapContainer } from 'react-leaflet';

/**
 * LeafletMapContainer - Thin wrapper untuk MapContainer.
 * StrictMode dihapus dari main.jsx karena tidak kompatibel dengan Leaflet
 * (menyebabkan "Map container is already initialized" error).
 */
const LeafletMapContainer = ({ children, ...props }) => {
    return (
        <MapContainer {...props}>
            {children}
        </MapContainer>
    );
};

export default LeafletMapContainer;
