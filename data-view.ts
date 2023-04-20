import { DataviewApi, getAPI } from "obsidian-dataview";

let _api: DataviewApi;

export async function dv(): Promise<DataviewApi> {
    if (!!_api) {
        return _api;
    }
    return await new Promise((resolve) => {
        const intervalID = setInterval(() => {
            if (ready()) {
                clearInterval(intervalID);
                resolve(_api); // 
            } else {
                _api = getAPI(app) as DataviewApi;
            }
        }, 50);
    });
}

export const ready = (): boolean => !!_api && !!_api.pages() && _api.pages().length > 0;
