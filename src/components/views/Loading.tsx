import { HashLoader } from 'react-spinners';

export default () => (
    <div className="h-screen w-screen flex flex-col justify-center items-center gap-4">
        <HashLoader color="blue" aria-label="Loading Spinner" />
        <p className="text-muted-foreground">Fetching Data from Google Sheets</p>
    </div>
);
