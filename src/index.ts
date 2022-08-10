import { SortingState } from "@tanstack/react-table";
import {
  FilterDefinition,
  FilteringState,
  isBuiltinFilterDefinition,
  PaginationState,
} from "@tableus/core/dist/core/types";
import {
  FetchArgs,
  Fetcher,
  FetchResult,
} from "@tableus/core/dist/fetcher/index";

export class LaravelRestFetcher<D extends object> implements Fetcher<D> {
  constructor(private readonly url: string) {}

  async fetch({ tableState, tableConfig }: FetchArgs): Promise<FetchResult<D>> {
    if (!tableState?.pagination) return [];
    const url = new URL(
      isAbsoluteUrl(this.url)
        ? this.url
        : `${window.location.origin}${this.url}`
    );
    const { pagination, sorting, filters } = tableState;
    if (pagination) setPaginationQueryParams(url, pagination);
    if (sorting.length !== 0) setSortingQueryParams(url, sorting);
    if (filters.length !== 0)
      setFiltersQueryParams(url, filters, tableConfig.filterDefinitions);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (
      "meta" in data &&
      "data" in data &&
      isLaravelMeta(data.meta) &&
      Array.isArray(data.data)
    ) {
      // todo: pagecount is no longer part of pagination state but we need to set it somewhere
      return {
        data: data.data,
        paginationState: transformLaravelMeta(data.meta),
      };
    }

    return data.data;
  }
}

export function setPaginationQueryParams(
  url: URL,
  paginationState: PaginationState
) {
  url.searchParams.set("page", (paginationState.pageIndex + 1).toString());
  url.searchParams.set("per_page", paginationState.pageSize.toString());
}

export function setSortingQueryParams(url: URL, sorting: SortingState) {
  const sortingString = sorting
    .map((sort) => (sort.desc ? "-" : "") + sort.id)
    .join(",");
  url.searchParams.set("sort", sortingString);
}

export function setFiltersQueryParams(
  url: URL,
  filters: FilteringState,
  filterDefinitions: FilterDefinition[]
) {
  const zippedFilters = filters.map((filter) => {
    const filterDefinition = filterDefinitions.find(
      (definition) => definition.key === filter.key
    );
    if (!filterDefinition)
      throw new Error(`Filter definition not found for ${filter.key}`);
    return {
      filter,
      filterDefinition,
    };
  });

  zippedFilters.forEach(({ filter, filterDefinition }) => {
    if (
      filter.value === null ||
      filter.value === undefined ||
      filter.value === ""
    )
      return;

    if (!isBuiltinFilterDefinition(filterDefinition)) {
      filterDefinition.translator(filter, url);
      return;
    }

    switch (filter.type) {
      case "search":
      case "select":
        url.searchParams.set(`filter[${filter.key}]=`, filter.value);
        break;
      case "check":
        if (filter.value)
          url.searchParams.set(`filter[${filter.key}]=`, filter.value);
        break;
      default:
        throw new Error(`Unsupported filter type: ${filter.type}`);
    }
  });
}

function isAbsoluteUrl(url: string): boolean {
  return url.indexOf("http://") === 0 || url.indexOf("https://") === 0;
}

interface LaravelMeta {
  current_page: number;
  from: number;
  last_page: number;
  per_page: number;
  to: number;
  total: number;
}

function isLaravelMeta(meta: object): meta is LaravelMeta {
  return (
    "current_page" in meta &&
    "from" in meta &&
    "last_page" in meta &&
    "per_page" in meta &&
    "to" in meta &&
    "total" in meta
  );
}

function transformLaravelMeta(
  meta: LaravelMeta
): PaginationState & { pageCount: number } {
  return {
    pageIndex: meta.current_page - 1,
    pageSize: meta.per_page,
    total: meta.total,
    pageCount: meta.last_page,
  };
}
